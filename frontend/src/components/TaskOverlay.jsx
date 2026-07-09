import React from 'react';
import { useTasks } from '../contexts/TaskContext';
import { Loader2 } from 'lucide-react';

export default function TaskOverlay() {
  const { tasks } = useTasks();

  const taskList = Object.values(tasks);
  if (taskList.length === 0) return null;

  return (
    <div className="task-overlay-container" style={{
      position: 'fixed',
      bottom: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none'
    }}>
      {taskList.map(task => {
        let actionStr = 'Operazione';
        if (task.type === 'create') actionStr = 'Creazione';
        if (task.type === 'recreate') actionStr = 'Aggiornamento';

        return (
          <div key={task.id} className="widget glass" style={{
            pointerEvents: 'auto',
            padding: '15px',
            minWidth: '250px',
            animation: 'slideInRight 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Loader2 size={18} className="spin" style={{ color: 'var(--primary)' }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{task.name}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{actionStr} in corso...</div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {task.status || 'Attendere...'}
            </div>
            
            <div style={{ width: '100%', height: '4px', background: 'var(--card-border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div 
                className="progress-bar-inner" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  background: 'var(--primary)',
                  animation: 'pulse 1.5s infinite'
                }} 
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
