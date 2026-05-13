const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');
const { parse: parseCsv } = require('csv-parse/sync');

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_PROMPT_TEXT_PER_ATTACHMENT = 12000;
const DEFAULT_ACTIVE_ATTACHMENT_TEXT_LIMIT = 4000;
const MAX_PROMPT_TEXT_PER_ARCHIVE_ENTRY = 4000;
const MAX_ARCHIVE_ENTRIES = 20;
const MAX_ARCHIVE_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const STORAGE_ROOT = process.env.UPLOAD_STORAGE_PATH || path.join(process.cwd(), 'storage', 'uploads');

const ATTACHMENT_TYPES = {
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.pdf': { kind: 'pdf', mime: 'application/pdf' },
  '.csv': { kind: 'csv', mime: 'text/csv' },
  '.docx': {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.txt': { kind: 'text', mime: 'text/plain' },
  '.zip': { kind: 'zip', mime: 'application/zip' },
};

const uploadParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE_BYTES,
    files: MAX_ATTACHMENTS_PER_MESSAGE,
  },
});

function ensureUploadStorage() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

function getAttachmentAcceptString() {
  return Object.keys(ATTACHMENT_TYPES).join(',');
}

function normalizeExtension(fileName = '') {
  return path.extname(fileName || '').toLowerCase();
}

function getAttachmentDefinition(fileName = '') {
  return ATTACHMENT_TYPES[normalizeExtension(fileName)] || null;
}

function sanitizeFileLabel(fileName = '') {
  return fileName.replace(/[^\w.\- ()[\]]+/g, '_').trim() || 'attachment';
}

function trimText(value, maxLength) {
  if (!value) {
    return '';
  }

  const normalized = String(value).replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}\n...[truncated]`;
}

function bytesToLabel(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCsvSummary(csvText) {
  const rows = parseCsv(csvText, {
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  const rowCount = rows.length;
  const headerRow = Array.isArray(rows[0]) ? rows[0].map((value) => String(value || '').trim()) : [];
  const sampleRows = rows.slice(1, 6).map((row) => row.map((value) => String(value || '').trim()));
  const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

  const lines = [
    `CSV rows: ${Math.max(rowCount - 1, 0)}`,
    `CSV columns: ${columnCount}`,
  ];

  if (headerRow.length > 0) {
    lines.push(`Headers: ${headerRow.slice(0, 12).join(', ')}`);
  }

  if (sampleRows.length > 0) {
    lines.push('Sample rows:');
    for (const row of sampleRows) {
      lines.push(`- ${row.slice(0, 12).join(' | ')}`);
    }
  }

  return {
    extractedText: trimText(lines.join('\n'), MAX_PROMPT_TEXT_PER_ATTACHMENT),
    structuredSummary: {
      rows: Math.max(rowCount - 1, 0),
      columns: columnCount,
      headers: headerRow.slice(0, 20),
      sample_rows: sampleRows,
    },
  };
}

async function extractArchiveContents(buffer) {
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory);
  const containedFiles = [];
  const ignoredFiles = [];
  const processedFiles = [];
  const sections = [];
  let totalBytes = 0;

  for (const entry of entries.slice(0, MAX_ARCHIVE_ENTRIES)) {
    const extension = normalizeExtension(entry.entryName);
    const definition = ATTACHMENT_TYPES[extension];
    const fileSize = entry.header.size || 0;
    totalBytes += fileSize;

    containedFiles.push({
      name: entry.entryName,
      size_bytes: fileSize,
      supported: !!definition,
    });

    if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      ignoredFiles.push({
        name: entry.entryName,
        reason: 'archive_too_large',
      });
      break;
    }

    if (!definition || definition.kind === 'zip') {
      ignoredFiles.push({
        name: entry.entryName,
        reason: definition ? 'nested_archive_not_supported' : 'unsupported_file_type',
      });
      continue;
    }

    if (definition.kind === 'image') {
      processedFiles.push({
        name: entry.entryName,
        kind: definition.kind,
        size_bytes: fileSize,
      });
      sections.push(`${entry.entryName}\nImage file included in archive.`);
      continue;
    }

    const entryBuffer = entry.getData();
    const extracted = await extractAttachmentData({
      kind: definition.kind,
      originalName: path.basename(entry.entryName),
      buffer: entryBuffer,
      fromArchive: true,
    });

    processedFiles.push({
      name: entry.entryName,
      kind: definition.kind,
      size_bytes: fileSize,
    });
    sections.push(`${entry.entryName}\n${trimText(extracted.extractedText, MAX_PROMPT_TEXT_PER_ARCHIVE_ENTRY)}`);
  }

  const archiveSummaryLines = [
    `Archive contains ${containedFiles.length} file(s).`,
  ];

  if (processedFiles.length > 0) {
    archiveSummaryLines.push(
      `Processed files: ${processedFiles.map((item) => `${item.name} (${item.kind})`).join(', ')}`
    );
  }

  if (ignoredFiles.length > 0) {
    archiveSummaryLines.push(
      `Ignored files: ${ignoredFiles.map((item) => `${item.name} [${item.reason}]`).join(', ')}`
    );
  }

  const extractedText = trimText(
    [archiveSummaryLines.join('\n'), ...sections].filter(Boolean).join('\n\n'),
    MAX_PROMPT_TEXT_PER_ATTACHMENT
  );

  return {
    extractedText,
    structuredSummary: {
      contained_files: containedFiles,
      processed_files: processedFiles,
      ignored_files: ignoredFiles,
    },
  };
}

async function extractAttachmentData({ kind, originalName, buffer, fromArchive = false }) {
  switch (kind) {
    case 'pdf': {
      const result = await pdfParse(buffer);
      return {
        extractedText: trimText(result.text || '', MAX_PROMPT_TEXT_PER_ATTACHMENT),
        structuredSummary: {
          page_count: result.numpages || null,
          source: fromArchive ? 'archive' : 'direct_upload',
        },
      };
    }

    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return {
        extractedText: trimText(result.value || '', MAX_PROMPT_TEXT_PER_ATTACHMENT),
        structuredSummary: {
          source: fromArchive ? 'archive' : 'direct_upload',
        },
      };
    }

    case 'csv': {
      return buildCsvSummary(buffer.toString('utf8'));
    }

    case 'text': {
      return {
        extractedText: trimText(buffer.toString('utf8'), MAX_PROMPT_TEXT_PER_ATTACHMENT),
        structuredSummary: {
          source: fromArchive ? 'archive' : 'direct_upload',
        },
      };
    }

    case 'zip':
      return extractArchiveContents(buffer);

    case 'image':
      return {
        extractedText: '',
        structuredSummary: {
          visual_analysis_available: true,
          source: fromArchive ? 'archive' : 'direct_upload',
        },
      };

    default:
      throw new Error(`Unsupported attachment kind: ${kind} (${originalName})`);
  }
}

function serializeAttachmentRow(row) {
  return {
    id: row.id,
    original_name: row.original_name,
    file_ext: row.file_ext,
    mime_type: row.mime_type,
    attachment_kind: row.attachment_kind,
    size_bytes: row.size_bytes,
    size_label: bytesToLabel(row.size_bytes),
    processing_status: row.processing_status,
    structured_summary: row.structured_summary || {},
    created_at: row.created_at,
  };
}

async function createAttachmentRecord({ shopId, file, db }) {
  if (!file || !file.originalname || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Invalid file payload');
  }

  const definition = getAttachmentDefinition(file.originalname);
  if (!definition) {
    throw new Error('Bu dosya tipi desteklenmiyor.');
  }

  ensureUploadStorage();

  const attachmentId = randomUUID();
  const fileExt = normalizeExtension(file.originalname);
  const shopDir = path.join(STORAGE_ROOT, shopId);
  const storedFileName = `${attachmentId}${fileExt}`;
  const absolutePath = path.join(shopDir, storedFileName);
  const relativePath = path.join(shopId, storedFileName).replace(/\\/g, '/');

  fs.mkdirSync(shopDir, { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);

  try {
    const extracted = await extractAttachmentData({
      kind: definition.kind,
      originalName: file.originalname,
      buffer: file.buffer,
    });

    const insertResult = await db.query(
      `INSERT INTO conversation_attachments (
         id,
         shop_id,
         original_name,
         file_ext,
         mime_type,
         attachment_kind,
         size_bytes,
         storage_path,
         extracted_text,
         structured_summary,
         processing_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'ready')
       RETURNING *`,
      [
        attachmentId,
        shopId,
        sanitizeFileLabel(file.originalname),
        fileExt,
        definition.mime,
        definition.kind,
        file.size || file.buffer.length,
        relativePath,
        extracted.extractedText || '',
        JSON.stringify(extracted.structuredSummary || {}),
      ]
    );

    return serializeAttachmentRow(insertResult.rows[0]);
  } catch (err) {
    safeUnlink(absolutePath);
    throw err;
  }
}

async function getAttachmentRowsByIds({ shopId, attachmentIds, db }) {
  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(attachmentIds)];
  const result = await db.query(
    `SELECT *
     FROM conversation_attachments
     WHERE shop_id = $1 AND id = ANY($2::uuid[])`,
    [shopId, uniqueIds]
  );

  const rowMap = new Map(result.rows.map((row) => [row.id, row]));
  return uniqueIds.map((id) => rowMap.get(id)).filter(Boolean);
}

function buildAttachmentContextPayload(rows, options = {}) {
  const textLimit = getAttachmentPromptTextLimit(options.userMessage);

  return rows.map((row) => ({
    id: row.id,
    name: row.original_name,
    kind: row.attachment_kind,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    summary: row.structured_summary || {},
    extracted_text: trimText(row.extracted_text || '', textLimit),
  }));
}

function getAttachmentPromptTextLimit(userMessage) {
  if (!userMessage) {
    return MAX_PROMPT_TEXT_PER_ATTACHMENT;
  }

  const normalized = String(userMessage || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    normalized.includes('tamamini') ||
    normalized.includes('tamamını') ||
    normalized.includes('dosyanin tamami') ||
    normalized.includes('dosyanın tamamı') ||
    normalized.includes('full') ||
    normalized.includes('ayrintili') ||
    normalized.includes('ayrıntılı') ||
    normalized.includes('detayli') ||
    normalized.includes('detaylı')
  ) {
    return MAX_PROMPT_TEXT_PER_ATTACHMENT;
  }

  return DEFAULT_ACTIVE_ATTACHMENT_TEXT_LIMIT;
}

async function buildImageContentParts(rows) {
  const imageRows = rows.filter((row) => row.attachment_kind === 'image');
  const parts = [];

  for (const row of imageRows) {
    const absolutePath = path.join(STORAGE_ROOT, row.storage_path);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const stats = fs.statSync(absolutePath);
    if (stats.size > MAX_INLINE_IMAGE_BYTES) {
      continue;
    }

    const data = fs.readFileSync(absolutePath).toString('base64');
    parts.push({
      type: 'image',
      mimeType: row.mime_type,
      data,
      name: row.original_name,
    });
  }

  return parts;
}

async function linkAttachmentsToMessage({ shopId, conversationId, messageIndex, attachmentIds, db }) {
  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return [];
  }

  const rows = await getAttachmentRowsByIds({ shopId, attachmentIds, db });
  if (rows.length !== [...new Set(attachmentIds)].length) {
    throw new Error('Bazi ekler bulunamadi.');
  }

  const alreadyLinked = rows.find((row) => row.conversation_id && row.conversation_id !== conversationId);
  if (alreadyLinked) {
    throw new Error('Eklerden biri baska bir konusmaya bagli.');
  }

  await db.query(
    `UPDATE conversation_attachments
     SET conversation_id = $1,
         message_index = $2,
         updated_at = NOW()
     WHERE shop_id = $3
       AND id = ANY($4::uuid[])`,
    [conversationId, messageIndex, shopId, [...new Set(attachmentIds)]]
  );

  return rows;
}

async function deletePendingAttachment({ shopId, attachmentId, db }) {
  const result = await db.query(
    `DELETE FROM conversation_attachments
     WHERE id = $1
       AND shop_id = $2
       AND conversation_id IS NULL
     RETURNING *`,
    [attachmentId, shopId]
  );

  if (result.rows[0]) {
    deleteFilesForRows(result.rows);
  }

  return result.rows[0] || null;
}

async function deleteConversationAttachmentsAfterIndex({ shopId, conversationId, messageIndex, db }) {
  const result = await db.query(
    `DELETE FROM conversation_attachments
     WHERE shop_id = $1
       AND conversation_id = $2
       AND message_index > $3
     RETURNING *`,
    [shopId, conversationId, messageIndex]
  );

  deleteFilesForRows(result.rows);
  return result.rows.length;
}

async function getConversationAttachments({ shopId, conversationId, db }) {
  const result = await db.query(
    `SELECT *
     FROM conversation_attachments
     WHERE shop_id = $1
       AND conversation_id = $2`,
    [shopId, conversationId]
  );

  return result.rows;
}

function deleteFilesForRows(rows) {
  for (const row of rows || []) {
    if (!row?.storage_path) {
      continue;
    }

    safeUnlink(path.join(STORAGE_ROOT, row.storage_path));
  }
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('Attachment file could not be removed:', err.message);
  }
}

module.exports = {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE_BYTES,
  buildAttachmentContextPayload,
  buildImageContentParts,
  createAttachmentRecord,
  deleteConversationAttachmentsAfterIndex,
  deleteFilesForRows,
  deletePendingAttachment,
  ensureUploadStorage,
  getAttachmentAcceptString,
  getAttachmentPromptTextLimit,
  getAttachmentRowsByIds,
  getConversationAttachments,
  linkAttachmentsToMessage,
  serializeAttachmentRow,
  uploadParser,
};
