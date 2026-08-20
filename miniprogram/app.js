// app.js - 小程序入口文件
// 全局初始化逻辑，管理用户身份等全局状态

App({
  // 全局数据
  globalData: {
    // 用户ID（模拟生成，实际项目可从登录接口获取）
    userId: '',
    // 用户基本信息
    userInfo: null,
    // 后端API基础地址
    baseUrl: 'http://localhost:5000/api'
  },

  /**
   * 小程序启动时执行
   * 初始化用户身份信息
   */
  onLaunch() {
    // 尝试从本地缓存读取用户ID
    let userId = wx.getStorageSync('user_id');
    if (!userId) {
      // 没有则生成一个随机ID模拟用户身份
      userId = 'u_' + this.generateRandomId();
      wx.setStorageSync('user_id', userId);
    }
    this.globalData.userId = userId;
    console.log('当前用户ID:', userId);
  },

  /**
   * 生成随机ID
   * @returns {string} 随机字符串
   */
  generateRandomId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 10);
    return timestamp + randomStr;
  }
});
