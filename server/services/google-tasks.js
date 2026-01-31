const { google } = require('googleapis');

class GoogleTasksService {
  constructor(authClient) {
    this.auth = authClient;
    this.tasks = google.tasks({ version: 'v1', auth: authClient });
  }

  // List all task lists
  async listTaskLists() {
    try {
      const response = await this.tasks.tasklists.list({
        maxResults: 100
      });

      return (response.data.items || []).map(list => ({
        id: list.id,
        title: list.title,
        updated: list.updated
      }));
    } catch (error) {
      console.error('Error listing task lists:', error);
      throw error;
    }
  }

  // List tasks from a task list
  async listTasks(taskListId, showCompleted = false, showHidden = false) {
    try {
      const response = await this.tasks.tasks.list({
        tasklist: taskListId,
        showCompleted: showCompleted,
        showHidden: showHidden,
        maxResults: 100
      });

      return (response.data.items || []).map(task => ({
        id: task.id,
        title: task.title,
        notes: task.notes,
        status: task.status,
        due: task.due,
        completed: task.completed,
        updated: task.updated,
        parent: task.parent,
        position: task.position,
        links: task.links
      }));
    } catch (error) {
      console.error('Error listing tasks:', error);
      throw error;
    }
  }

  // Get all tasks from all lists
  async getAllTasks(showCompleted = false) {
    try {
      const taskLists = await this.listTaskLists();
      const allTasks = [];

      for (const list of taskLists) {
        const tasks = await this.listTasks(list.id, showCompleted);
        allTasks.push({
          listId: list.id,
          listTitle: list.title,
          tasks: tasks
        });
      }

      return allTasks;
    } catch (error) {
      console.error('Error getting all tasks:', error);
      throw error;
    }
  }

  // Get single task
  async getTask(taskListId, taskId) {
    try {
      const response = await this.tasks.tasks.get({
        tasklist: taskListId,
        task: taskId
      });
      return response.data;
    } catch (error) {
      console.error('Error getting task:', error);
      throw error;
    }
  }

  // Create task
  async createTask(taskListId, taskData) {
    try {
      const task = {
        title: taskData.title,
        notes: taskData.notes,
        due: taskData.due,
        status: taskData.status || 'needsAction'
      };

      const response = await this.tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: task
      });

      return response.data;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  // Update task
  async updateTask(taskListId, taskId, taskData) {
    try {
      const task = {
        title: taskData.title,
        notes: taskData.notes,
        due: taskData.due,
        status: taskData.status
      };

      const response = await this.tasks.tasks.update({
        tasklist: taskListId,
        task: taskId,
        requestBody: task
      });

      return response.data;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  // Complete/uncomplete task
  async toggleTask(taskListId, taskId) {
    try {
      const task = await this.getTask(taskListId, taskId);
      const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';

      const response = await this.tasks.tasks.update({
        tasklist: taskListId,
        task: taskId,
        requestBody: {
          ...task,
          status: newStatus,
          completed: newStatus === 'completed' ? new Date().toISOString() : null
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error toggling task:', error);
      throw error;
    }
  }

  // Delete task
  async deleteTask(taskListId, taskId) {
    try {
      await this.tasks.tasks.delete({
        tasklist: taskListId,
        task: taskId
      });
      return { success: true };
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  // Clear completed tasks
  async clearCompleted(taskListId) {
    try {
      await this.tasks.tasks.clear({
        tasklist: taskListId
      });
      return { success: true };
    } catch (error) {
      console.error('Error clearing completed tasks:', error);
      throw error;
    }
  }
}

module.exports = GoogleTasksService;
