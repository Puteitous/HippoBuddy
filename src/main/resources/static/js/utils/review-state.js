import { EventBus } from './event-bus.js';

const rollbackStatusMap = new Map();

export const ReviewState = {
  markRolledBack(filePath) {
    rollbackStatusMap.set(filePath, 'rolled_back');
    EventBus.emit('file:review-updated');
  },

  isRolledBack(filePath) {
    return rollbackStatusMap.get(filePath) === 'rolled_back';
  },

  clear() {
    rollbackStatusMap.clear();
  }
};
