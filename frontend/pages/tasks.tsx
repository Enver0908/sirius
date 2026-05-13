import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TaskCard from '../components/TaskCard';
import { useI18n } from '../lib/i18n';
import { useTaskStore } from '../store/index';

export default function TasksPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const { tasks, loading, fetchTasks, updateTaskStatus } = useTaskStore();
  const router = useRouter();

  useEffect(() => {
    fetchTasks(filter);
  }, [fetchTasks, filter]);

  const filters = [
    { key: 'all', label: t('tasksPage.filters.all') },
    { key: 'pending', label: t('tasksPage.filters.pending') },
    { key: 'in_progress', label: t('tasksPage.filters.in_progress') },
    { key: 'done', label: t('tasksPage.filters.done') },
  ];

  const filteredTasks = tasks
    .filter((task) => filter === 'all' || task.status === filter)
    .sort((a, b) => b.priority_score - a.priority_score);

  const counts = {
    all: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    in_progress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
  };

  return (
    <div className="min-h-screen bg-[#090b12] text-white">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-8 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-white/35 transition-colors hover:text-white/70"
          >
            {'<-'} Sirius
          </button>
          <div className="h-5 w-px bg-white/[0.08]" />
          <h1 className="text-lg font-bold text-white">{t('tasksPage.title')}</h1>
        </div>
        <span className="text-xs text-white/25">{t('tasksPage.totalTasks', { count: tasks.length })}</span>
      </header>

      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="mb-8 flex w-fit gap-1 rounded-xl bg-white/[0.02] p-1">
          {filters.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                filter === tab.key ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab.label}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${filter === tab.key ? 'bg-cyan-400/20' : 'bg-white/[0.05]'}`}>
                {counts[tab.key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-white/25">{t('common.loading')}</div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mb-4 text-sm text-white/25">
              {filter === 'all' ? t('tasksPage.noTasks') : t('tasksPage.noTasksForFilter')}
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs text-cyan-300 transition-colors hover:text-cyan-200"
            >
              {'<-'} {t('tasksPage.backToDashboard')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
