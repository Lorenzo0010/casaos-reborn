import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useDialog } from './DialogContext';

const TaskContext = createContext();

export function useTasks() {
  return useContext(TaskContext);
}

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState({});
  const { showAlert } = useDialog();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get('/api/docker/tasks', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const taskMap = {};
        res.data.forEach(task => {
          taskMap[task.id] = task;
        });
        setTasks(taskMap);
      } catch (err) {
        console.error('Error fetching tasks:', err);
      }
    };

    fetchTasks();

    const token = localStorage.getItem('token');
    if (!token) return;
    
    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    const handleProgress = (data) => {
      if (data && data.taskId) {
        setTasks(prev => ({
          ...prev,
          [data.taskId]: { ...data, id: data.taskId }
        }));
      }
    };

    const handleSuccess = (data) => {
      if (data && data.taskId) {
        setTasks(prev => {
          const newTasks = { ...prev };
          delete newTasks[data.taskId];
          return newTasks;
        });
      }
    };

    const handleError = (data) => {
      if (data && data.taskId) {
        setTasks(prev => {
          const newTasks = { ...prev };
          delete newTasks[data.taskId];
          return newTasks;
        });
        showAlert('Errore Operazione', data.error || 'Si è verificato un errore', true);
      }
    };

    socket.on('container.create.progress', handleProgress);
    socket.on('container.create.success', handleSuccess);
    socket.on('container.create.error', handleError);

    socket.on('container.recreate.progress', handleProgress);
    socket.on('container.recreate.success', handleSuccess);
    socket.on('container.recreate.error', handleError);

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <TaskContext.Provider value={{ tasks }}>
      {children}
    </TaskContext.Provider>
  );
}
