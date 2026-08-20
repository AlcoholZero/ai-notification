// detail.js - 通知详情页
// 显示通知完整信息，支持删除操作

const api = require('../../utils/api.js');

Page({
  // 页面数据
  data: {
    // 通知ID
    id: '',
    // 通知详情数据
    detail: null,
    // 是否正在加载
    loading: true,
    // 来源类型显示信息
    sourceLabel: '',
    sourceIcon: ''
  },

  /**
   * 页面加载 - 获取URL参数中的通知ID
   */
  onLoad(options) {
    const id = options.id || '';
    this.setData({ id: id });
    if (id) {
      this.loadDetail(id);
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' });
    }
  },

  /**
   * 加载通知详情
   * @param {string} id - 通知ID
   */
  loadDetail(id) {
    this.setData({ loading: true });
    api.getNotificationDetail(id).then((data) => {
      // 设置来源类型显示信息
      const sourceMap = {
        text: { icon: '✏️', label: '文字输入' },
        voice: { icon: '🎤', label: '语音输入' },
        screenshot: { icon: '📷', label: '截图识别' }
      };
      const sourceInfo = sourceMap[data.source_type] || sourceMap.text;

      this.setData({
        detail: data,
        sourceIcon: sourceInfo.icon,
        sourceLabel: sourceInfo.label,
        loading: false
      });
    }).catch((err) => {
      console.error('获取通知详情失败:', err);
      this.setData({ loading: false });
    });
  },

  /**
   * 删除通知 - 弹出确认框
   */
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除这条通知吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          this.confirmDelete();
        }
      }
    });
  },

  /**
   * 确认删除通知
   */
  confirmDelete() {
    api.deleteNotification(this.data.id).then(() => {
      wx.showToast({ title: '删除成功', icon: 'success' });
      // 延迟返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    }).catch((err) => {
      console.error('删除失败:', err);
    });
  },

  /**
   * 复制原始内容到剪贴板
   */
  onCopyContent() {
    if (this.data.detail && this.data.detail.content) {
      wx.setClipboardData({
        data: this.data.detail.content,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' });
        }
      });
    }
  }
});
