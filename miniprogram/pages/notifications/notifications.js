// notifications.js - 通知列表页
// 提供项目标签筛选、下拉刷新、上拉加载更多功能

const api = require('../../utils/api.js');

Page({
  // 页面数据
  data: {
    // 项目标签列表（含"全部"）
    tags: ['全部'],
    // 当前选中的标签
    currentTag: '全部',
    // 通知列表
    notifications: [],
    // 分页参数
    page: 1,
    pageSize: 20,
    // 是否还有更多数据
    hasMore: true,
    // 是否正在加载
    loading: false,
    // 是否显示空状态
    showEmpty: false
  },

  /**
   * 页面加载
   */
  onLoad() {
    // 加载项目标签
    this.loadProjects();
    // 加载通知列表
    this.loadNotifications(true);
  },

  /**
   * 页面显示时刷新数据
   */
  onShow() {
    // 如果从详情页返回，刷新列表
    if (this.data.notifications.length > 0) {
      this.loadNotifications(true);
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadNotifications(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadNotifications(false);
    }
  },

  /**
   * 加载项目标签列表
   */
  loadProjects() {
    api.getProjects().then((data) => {
      const projects = data.list || data || [];
      const tags = ['全部'].concat(projects.map(p => p.name));
      this.setData({ tags: tags });
    }).catch((err) => {
      console.error('获取项目标签失败:', err);
    });
  },

  /**
   * 加载通知列表
   * @param {boolean} isRefresh - 是否刷新（重置到第一页）
   * @returns {Promise}
   */
  loadNotifications(isRefresh) {
    if (this.data.loading) return Promise.resolve();

    const page = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    return api.getNotifications(this.data.currentTag, page, this.data.pageSize).then((data) => {
      const list = data.list || data || [];
      const total = data.total || 0;

      // 判断是否还有更多
      const hasMore = list.length >= this.data.pageSize;

      this.setData({
        notifications: isRefresh ? list : this.data.notifications.concat(list),
        page: page,
        hasMore: hasMore,
        loading: false,
        showEmpty: isRefresh && list.length === 0
      });
    }).catch((err) => {
      console.error('获取通知列表失败:', err);
      this.setData({ loading: false });
    });
  },

  /**
   * 点击标签筛选
   */
  onTagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    if (tag === this.data.currentTag) return;

    this.setData({
      currentTag: tag,
      notifications: [],
      page: 1,
      hasMore: true
    });
    this.loadNotifications(true);
  },

  /**
   * 点击通知卡片，跳转详情页
   */
  onNotificationTap(e) {
    const id = e.detail.id;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id
    });
  }
});
