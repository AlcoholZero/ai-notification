/**
 * api.js - API请求统一封装
 * 封装 wx.request 和 wx.uploadFile，统一处理错误
 */

// 后端API基础地址
const BASE_URL = 'http://localhost:5000/api';

/**
 * 获取当前用户ID
 * @returns {string} 用户ID
 */
function getUserId() {
  const app = getApp();
  return app.globalData.userId;
}

/**
 * 封装 wx.request - 统一GET/POST请求
 * @param {string} url - 请求路径（不含BASE_URL）
 * @param {string} method - 请求方法 GET/POST
 * @param {object} data - 请求数据
 * @returns {Promise} 返回Promise对象
 */
function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      header: {
        'Content-Type': method === 'GET' ? 'application/json' : 'application/json'
      },
      success(res) {
        // HTTP请求成功
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const responseData = res.data;
          // 后端返回格式: { code: 0/1, message: "", data: {} }
          if (responseData.code === 0) {
            // code为0表示成功
            resolve(responseData.data);
          } else {
            // code为1表示业务错误
            showErrorToast(responseData.message || '请求失败');
            reject(responseData);
          }
        } else {
          showErrorToast('网络请求错误: ' + res.statusCode);
          reject(res);
        }
      },
      fail(err) {
        showErrorToast('网络连接失败，请检查网络');
        reject(err);
      }
    });
  });
}

/**
 * 封装 wx.uploadFile - 文件上传（图片、语音）
 * @param {string} url - 上传路径
 * @param {string} filePath - 本地文件路径
 * {string} fileName - 文件字段名
 * {object} formData - 额外的表单数据
 * @returns {Promise}
 */
function uploadFile(url, filePath, fileName = 'file', formData = {}) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + url,
      filePath: filePath,
      name: fileName,
      formData: formData,
      header: {
        'Content-Type': 'multipart/form-data'
      },
      success(res) {
        // 上传成功，解析返回数据
        try {
          const responseData = JSON.parse(res.data);
          if (responseData.code === 0) {
            resolve(responseData.data);
          } else {
            showErrorToast(responseData.message || '上传失败');
            reject(responseData);
          }
        } catch (e) {
          showErrorToast('解析响应数据失败');
          reject(e);
        }
      },
      fail(err) {
        showErrorToast('文件上传失败');
        reject(err);
      }
    });
  });
}

/**
 * 显示错误提示
 * @param {string} message - 错误信息
 */
function showErrorToast(message) {
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  });
}

/* ==================== 通知相关API ==================== */

/**
 * 上传截图识别通知
 * @param {string} filePath - 图片本地路径
 * @returns {Promise}
 */
function uploadScreenshot(filePath) {
  return uploadFile('/notify/upload', filePath, 'file', {
    user_id: getUserId()
  });
}

/**
 * 上传语音识别通知
 * @param {string} filePath - 语音文件本地路径
 * @returns {Promise}
 */
function uploadVoice(filePath) {
  return uploadFile('/notify/voice', filePath, 'file', {
    user_id: getUserId()
  });
}

/**
 * 提交文字通知
 * @param {string} text - 文字内容
 * @returns {Promise}
 */
function submitText(text) {
  return request('/notify/text', 'POST', {
    user_id: getUserId(),
    text: text
  });
}

/**
 * 获取通知列表
 * @param {string} projectTag - 项目标签筛选（可选）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise}
 */
function getNotifications(projectTag = '', page = 1, pageSize = 20) {
  const params = {
    user_id: getUserId(),
    page: page,
    page_size: pageSize
  };
  if (projectTag && projectTag !== '全部') {
    params.project_tag = projectTag;
  }
  return request('/notifications', 'GET', params);
}

/**
 * 获取通知详情
 * @param {string} id - 通知ID
 * @returns {Promise}
 */
function getNotificationDetail(id) {
  return request('/notifications/' + id, 'GET');
}

/**
 * 删除通知
 * @param {string} id - 通知ID
 * @returns {Promise}
 */
function deleteNotification(id) {
  return request('/notifications/' + id, 'DELETE');
}

/* ==================== 项目标签相关API ==================== */

/**
 * 获取项目标签列表
 * @returns {Promise}
 */
function getProjects() {
  return request('/projects', 'GET', {
    user_id: getUserId()
  });
}

/**
 * 创建项目标签
 * @param {string} name - 项目名称
 * @param {string} color - 标签颜色
 * @returns {Promise}
 */
function createProject(name, color) {
  return request('/projects', 'POST', {
    name: name,
    color: color
  });
}

/* ==================== 统计相关API ==================== */

/**
 * 获取用户统计信息
 * @returns {Promise}
 */
function getStatistics() {
  return request('/statistics', 'GET', {
    user_id: getUserId()
  });
}

// 导出所有API方法
module.exports = {
  BASE_URL,
  getUserId,
  request,
  uploadFile,
  // 通知相关
  uploadScreenshot,
  uploadVoice,
  submitText,
  getNotifications,
  getNotificationDetail,
  deleteNotification,
  // 项目标签相关
  getProjects,
  createProject,
  // 统计
  getStatistics
};
