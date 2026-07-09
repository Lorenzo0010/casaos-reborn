import React, { createContext, useContext } from 'react';

const TaskContext = createContext();

export function useTasks() {
  return useContext(TaskContext);
}

// TaskProvider is kept as a no-op wrapper for backward compatibility.
// All task tracking is now handled directly in Dashboard.jsx via its own
// socket connection, avoiding duplicate socket connections and double alerts.
export function TaskProvider({ children }) {
  return (
    <TaskContext.Provider value={{ tasks: {} }}>
      {children}
    </TaskContext.Provider>
  );
}
