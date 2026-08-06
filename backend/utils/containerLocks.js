const containerLocks = new Set();

/**
 * Acquires a lock for a given container name and executes the callback.
 * If the lock is already held, it throws an Error.
 * @param {string} containerName 
 * @param {Function} callback 
 */
const withContainerLock = async (containerName, callback) => {
  if (!containerName) {
    // Se per qualche motivo manca il nome, eseguiamo senza lock
    return await callback();
  }

  if (containerLocks.has(containerName)) {
    const error = new Error(`An operation is already in progress for container: ${containerName}`);
    error.status = 409; // Conflict
    throw error;
  }

  containerLocks.add(containerName);
  try {
    return await callback();
  } finally {
    containerLocks.delete(containerName);
  }
};

const isLocked = (containerName) => containerLocks.has(containerName);

module.exports = {
  withContainerLock,
  isLocked
};
