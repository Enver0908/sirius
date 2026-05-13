import { useI18n } from '../lib/i18n';
import { Task } from '../store/index';

interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: string, status: string) => void;
}

function getPriorityColor(score: number): string {
  if (score >= 80) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (score >= 50) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
}

function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'pending':
      return { label: t('common.pending'), color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    case 'in_progress':
      return { label: t('common.inProgress'), color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 'done':
      return { label: t('common.done'), color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    default:
      return { label: status, color: 'text-slate-400', bg: 'bg-slate-500/10' };
  }
}

export default function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const { t, locale } = useI18n();
  const priorityClass = getPriorityColor(task.priority_score);
  const statusConf = getStatusConfig(task.status, t);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${priorityClass}`}>
            {task.priority_score}
          </span>
          <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400">
            {task.confidence_score}
          </span>
        </div>
        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusConf.bg} ${statusConf.color}`}>
          {statusConf.label}
        </span>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-white">{task.title}</h3>
      {task.description && (
        <p className="mb-3 text-xs leading-relaxed text-white/40">{task.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.04] pt-3">
        {task.source_skill && (
          <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-400">
            {task.source_skill}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {task.status === 'pending' && (
            <button
              onClick={() => onStatusChange(task.id, 'in_progress')}
              className="rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-400 transition-all hover:bg-blue-500/20"
            >
              {t('common.start')}
            </button>
          )}
          {task.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange(task.id, 'done')}
              className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20"
            >
              {t('common.complete')}
            </button>
          )}
          {task.status === 'done' && task.completed_at && (
            <span className="text-[11px] text-white/25">
              {new Date(task.completed_at).toLocaleDateString(locale)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
