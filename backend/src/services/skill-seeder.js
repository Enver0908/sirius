const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../skills');
const SKILL_VERSION = 'v4';

const SIRIUS_SKILLS = [
  'router',
  'genel-analiz',
  'satis-raporu',
  'anomali',
  'rca-aksiyon',
  'gorev',
  'oncelik',
  'guven-skoru',
  'sirius-ton',
];

async function seedSkillsForShop(shopId, plan, dbClient) {
  const skillNames = SIRIUS_SKILLS;

  console.log(`Skill seeding: ${skillNames.length} skills -> shop ${shopId} (${plan})`);

  for (const skillName of skillNames) {
    try {
      const filePath = path.join(SKILLS_DIR, `${skillName}.skill`);
      if (!fs.existsSync(filePath)) {
        console.warn(`Skill file not found: ${filePath}`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      await dbClient.query(
        `INSERT INTO skill_assignments (shop_id, skill_name, skill_content, is_active, version)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (shop_id, skill_name)
         DO UPDATE SET
           skill_content = $3,
           is_active = true,
           version = $4`,
        [shopId, skillName, content, SKILL_VERSION]
      );
    } catch (err) {
      console.error(`Skill seed error [${skillName}]:`, err.message);
    }
  }

  const allSkills = SIRIUS_SKILLS;
  const inactiveSkills = allSkills.filter((skillName) => !skillNames.includes(skillName));

  if (inactiveSkills.length > 0) {
    await dbClient.query(
      `UPDATE skill_assignments
       SET is_active = false
       WHERE shop_id = $1 AND skill_name = ANY($2)`,
      [shopId, inactiveSkills]
    );
  }

  console.log(`Skill seeding completed: ${skillNames.length} active, ${inactiveSkills.length} inactive`);
}

module.exports = {
  seedSkillsForShop,
  SIRIUS_SKILLS,
  SKILL_VERSION,
};
