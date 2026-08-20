// profile.js - 个人中心页
// 用户信息展示、统计信息、项目标签管理、关于页面

const api = require('../../utils/api.js');

Page({
  // 页面数据
  data: {
    // 用户ID
    userId: '',
    // 用户昵称
    nickname: 'AI通知用户',
    // 用户头像
    avatarUrl: '',
    // 统计信息
    stats: {
      total: 0,        // 累计处理通知数
      weekly: 0,       // 本周处理数
      accuracy: '0%'   // 分类准确率
    },
    // 项目标签列表
    projects: [],
    // 新建项目弹窗
    showCreateModal: false,
    // 新建项目名称
    newProjectName: '',
    // 新建项目颜色
    newProjectColor: '#3B82F6',
    // 可选颜色列表
    colorOptions: [
      '#3B82F6', '#10B981', '#F59E0B',
      '#EF4444', '#8B5CF6', '#EC4899',
      '#06B6D4', '#6366F1'
    ]
  },

  /**
   * 页面加载
   */
  onLoad() {
    const app = getApp();
    this.setData({
      userId: app.globalData.userId
    });
  },

  /**
   * 页面显示时刷新数据
   */
  onShow() {
    this.loadStatistics();
    this.loadProjects();
  },

  /**
   * 加载统计信息
   */
  loadStatistics() {
    api.getStatistics().then((data) => {
      this.setData({
        stats: {
          total: data.total || 0,
          weekly: data.weekly || 0,
          accuracy: (data.accuracy || 0) + '%'
        }
      });
    }).catch((err) => {
      console.error('获取统计信息失败:', err);
    });
  },

  /**
   * 加载项目标签列表
   */
  loadProjects() {
    api.getProjects().then((data) => {
      const list = data.list || data || [];
      this.setData({ projects: list });
    }).catch((err) => {
      console.error('获取项目标签失败:', err);
    });
  },

  /**
   * 选择头像（从相册）
   */
  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ avatarUrl: tempFilePath });
        // 实际项目应上传到服务器
        wx.setStorageSync('avatar_url', tempFilePath);
      }
    });
  },

  /**
   * 显示新建项目弹窗
   */
  showCreateProjectModal() {
    this.setData({
      showCreateModal: true,
      newProjectName: '',
      newProjectColor: '#3B82F6'
    });
  },

  /**
   * 隐藏新建项目弹窗
   */
  hideCreateProjectModal() {
    this.setData({ showCreateModal: false });
  },

  /**
   * 新项目名称输入
   */
  onProjectNameInput(e) {
    this.setData({ newProjectName: e.detail.value });
  },

  /**
   * 选择项目颜色
   */
  onColorSelect(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ newProjectColor: color });
  },

  /**
   * 确认创建项目
   */
  createProject() {
    const name = this.data.newProjectName.trim();
    if (!name) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return;
    }

    api.createProject(name, this.data.newProjectColor).then((data) => {
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showCreateModal: false });
      this.loadProjects();
    }).catch((err) => {
      console.error('创建项目失败:', err);
    });
  },

  /**
   * 跳转到关于页面
   */
  goToAbout() {
    wx.showModal({
      title: '关于AI通知助手',
      content: '版本：v1.0.0\n\nAI通知助手是一款智能通知识别与管理工具。支持拍照、语音、文字等多种输入方式，由AI自动识别、提取、分类并推送通知。\n\n让团队通知不再遗漏。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 清除本地缓存
   */
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定清除本地缓存数据吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '清除成功', icon: 'success' });
          // 重新初始化用户ID
          const app = getApp();
          let userId = 'u_' + app.generateRandomId();
          wx.setStorageSync('user_id', userId);
          app.globalData.userId = userId;
          this.setData({ userId: userId });
          setTimeout(() => {
            this.loadStatistics();
            this.loadProjects();
          }, 1000);
        }
      }
    });
  }
});
