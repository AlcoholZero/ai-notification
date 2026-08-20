/**
 * API 客户端 - 封装所有后端接口调用
 * 对应后端 http://localhost:5000/api
 */
const API = (function () {
  const BASE_URL = 'http://localhost:5000/api';

  function getUserId() {
    return App.state.userId;
  }

  async function request(url, method = 'GET', data = {}) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (method !== 'GET' && Object.keys(data).length > 0) {
        opts.body = JSON.stringify(data);
      }
      const res = await fetch(BASE_URL + url, opts);
      const json = await res.json();
      if (json.code === 0) return json.data;
      showToast(json.message || '请求失败');
      throw json;
    } catch (err) {
      if (err.code === undefined) showToast('网络连接失败');
      throw err;
    }
  }

  async function uploadFile(url, file, formData = {}) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      for (const [k, v] of Object.entries(formData)) fd.append(k, v);
      const res = await fetch(BASE_URL + url, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.code === 0) return json.data;
      showToast(json.message || '上传失败');
      throw json;
    } catch (err) {
      if (err.code === undefined) showToast('文件上传失败');
      throw err;
    }
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  return {
    BASE_URL,
    getUserId,
    request,
    uploadFile,

    uploadScreenshot(file, projectTag = '') {
      const fd = { user_id: getUserId() };
      if (projectTag && projectTag !== '全部') fd.project_tag = projectTag;
      return uploadFile('/notify/upload', file, fd);
    },
    uploadVoice(file, projectTag = '') {
      const fd = { user_id: getUserId() };
      if (projectTag && projectTag !== '全部') fd.project_tag = projectTag;
      return uploadFile('/notify/voice', file, fd);
    },
    submitText(text, projectTag = '') {
      const body = { user_id: getUserId(), text };
      if (projectTag && projectTag !== '全部') body.project_tag = projectTag;
      return request('/notify/text', 'POST', body);
    },
    generateStyles(title, content) {
      return request('/notify/styles', 'POST', { title, content });
    },
    updateNotification(id, content) {
      return request('/notifications/' + id, 'PUT', { content });
    },
    getNotifications(projectTag = '', page = 1, pageSize = 20) {
      const params = new URLSearchParams({ user_id: getUserId(), page, page_size: pageSize });
      if (projectTag && projectTag !== '全部') params.set('project_tag', projectTag);
      return request('/notifications?' + params);
    },
    getNotificationDetail(id) {
      return request('/notifications/' + id, 'GET');
    },
    deleteNotification(id) {
      return request('/notifications/' + id, 'DELETE');
    },
    getProjects() {
      return request('/projects?user_id=' + getUserId(), 'GET');
    },
    createProject(name, color, notes = '') {
      return request('/projects', 'POST', { name, color, notes });
    },
    getStatistics() {
      return request('/statistics?user_id=' + getUserId(), 'GET');
    },
    getCalendar(year, month) {
      return request('/calendar?user_id=' + getUserId() + '&year=' + year + '&month=' + month, 'GET');
    },
    getTodayTodos() {
      return request('/today_todos?user_id=' + getUserId(), 'GET');
    },
    getDateTodos(date) {
      return request('/date_todos?user_id=' + getUserId() + '&date=' + date, 'GET');
    },
    healthCheck() {
      return request('/health', 'GET');
    },
  };
})();
