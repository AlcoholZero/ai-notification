// index.js - 首页（多模态输入）
// 提供拍照识别、语音输入、文字输入三种方式提交通知

const api = require('../../utils/api.js');

Page({
  // 页面数据
  data: {
    // 处理状态: idle(空闲) / processing(处理中) / done(完成)
    processStatus: 'idle',
    // 处理结果
    result: null,
    // 最近处理的通知列表
    recentNotifications: [],
    // 文字输入弹窗
    showTextInput: false,
    // 文字输入内容
    textContent: '',
    // 录音状态
    isRecording: false,
    // 录音时长（秒）
    recordDuration: 0,
    // 录音计时器
    recordTimer: null
  },

  // 录音管理器
  recorderManager: null,

  /**
   * 页面加载
   */
  onLoad() {
    // 初始化录音管理器
    this.recorderManager = wx.getRecorderManager();

    // 监听录音结束事件
    this.recorderManager.onStop((res) => {
      console.log('录音结束:', res);
      this.setData({
        isRecording: false,
        recordDuration: 0
      });
      // 清除计时器
      if (this.data.recordTimer) {
        clearInterval(this.data.recordTimer);
        this.data.recordTimer = null;
      }
      // 上传语音文件
      this.uploadVoiceFile(res.tempFilePath);
    });

    // 监听录音错误
    this.recorderManager.onError((err) => {
      console.error('录音错误:', err);
      wx.showToast({ title: '录音失败', icon: 'none' });
      this.setData({ isRecording: false });
      if (this.data.recordTimer) {
        clearInterval(this.data.recordTimer);
        this.data.recordTimer = null;
      }
    });

    // 加载最近通知
    this.loadRecentNotifications();
  },

  /**
   * 页面显示时刷新最近通知
   */
  onShow() {
    this.loadRecentNotifications();
  },

  /**
   * 加载最近处理的通知列表（最多3条）
   */
  loadRecentNotifications() {
    api.getNotifications('', 1, 3).then((data) => {
      const list = data.list || data || [];
      this.setData({ recentNotifications: list });
    }).catch((err) => {
      console.error('获取最近通知失败:', err);
    });
  },

  /* ==================== 拍照识别 ==================== */

  /**
   * 点击拍照识别按钮
   */
  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'], // 仅相机
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadScreenshot(tempFilePath);
      },
      fail: (err) => {
        console.log('取消拍照:', err);
      }
    });
  },

  /* ==================== 相册选图 ==================== */

  /**
   * 从相册选择图片上传
   */
  onChooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'], // 仅相册
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadScreenshot(tempFilePath);
      },
      fail: (err) => {
        console.log('取消选择图片:', err);
      }
    });
  },

  /**
   * 上传截图到后端识别
   * @param {string} filePath - 图片本地路径
   */
  uploadScreenshot(filePath) {
    this.setData({
      processStatus: 'processing',
      result: null
    });

    api.uploadScreenshot(filePath).then((data) => {
      // 处理完成，显示结果
      this.setData({
        processStatus: 'done',
        result: data
      });
      // 刷新最近通知列表
      this.loadRecentNotifications();
    }).catch((err) => {
      console.error('截图识别失败:', err);
      this.setData({ processStatus: 'idle' });
    });
  },

  /* ==================== 语音输入 ==================== */

  /**
   * 开始录音
   */
  startRecording() {
    // 请求录音权限
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        // 开始录音
        this.recorderManager.start({
          duration: 60000, // 最长60秒
          format: 'mp3',
          sampleRate: 16000,
          numberOfChannels: 1
        });

        // 开始计时
        this.setData({ isRecording: true, recordDuration: 0 });
        this.data.recordTimer = setInterval(() => {
          this.setData({
            recordDuration: this.data.recordDuration + 1
          });
          // 超过60秒自动停止
          if (this.data.recordDuration >= 60) {
            this.stopRecording();
          }
        }, 1000);
      },
      fail: () => {
        wx.showToast({ title: '请授权录音权限', icon: 'none' });
      }
    });
  },

  /**
   * 停止录音
   */
  stopRecording() {
    if (this.data.isRecording) {
      this.recorderManager.stop();
    }
  },

  /**
   * 上传语音文件
   * @param {string} filePath - 语音文件路径
   */
  uploadVoiceFile(filePath) {
    this.setData({
      processStatus: 'processing',
      result: null
    });

    api.uploadVoice(filePath).then((data) => {
      this.setData({
        processStatus: 'done',
        result: data
      });
      this.loadRecentNotifications();
    }).catch((err) => {
      console.error('语音识别失败:', err);
      this.setData({ processStatus: 'idle' });
    });
  },

  /* ==================== 文字输入 ==================== */

  /**
   * 显示文字输入弹窗
   */
  showTextInputModal() {
    this.setData({
      showTextInput: true,
      textContent: ''
    });
  },

  /**
   * 隐藏文字输入弹窗
   */
  hideTextInputModal() {
    this.setData({ showTextInput: false });
  },

  /**
   * 文字输入内容变化
   */
  onTextInput(e) {
    this.setData({ textContent: e.detail.value });
  },

  /**
   * 提交文字通知
   */
  submitText() {
    const text = this.data.textContent.trim();
    if (!text) {
      wx.showToast({ title: '请输入通知内容', icon: 'none' });
      return;
    }

    this.setData({
      showTextInput: false,
      processStatus: 'processing',
      result: null
    });

    api.submitText(text).then((data) => {
      this.setData({
        processStatus: 'done',
        result: data
      });
      this.loadRecentNotifications();
    }).catch((err) => {
      console.error('文字处理失败:', err);
      this.setData({ processStatus: 'idle' });
    });
  },

  /* ==================== 结果预览 ==================== */

  /**
   * 关闭结果预览，重置状态
   */
  closeResult() {
    this.setData({
      processStatus: 'idle',
      result: null
    });
  },

  /* ==================== 通知列表跳转 ==================== */

  /**
   * 点击最近通知卡片，跳转详情
   */
  onNotificationTap(e) {
    const id = e.detail.id;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id
    });
  },

  /**
   * 查看全部通知
   */
  viewAllNotifications() {
    wx.switchTab({
      url: '/pages/notifications/notifications'
    });
  }
});
