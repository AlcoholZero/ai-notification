// notification-card.js - 通知卡片组件
// 用于在列表中展示单条通知信息

Component({
  // 组件属性
  properties: {
    // 通知数据对象
    notification: {
      type: Object,
      value: {}
    }
  },

  // 组件内部数据
  data: {
    // 来源类型对应的图标和文字
    sourceMap: {
      text: { icon: '\u270F\uFE0F', label: '文字' },
      voice: { icon: '\uD83C\uDFA4', label: '语音' },
      screenshot: { icon: '\uD83D\uDCF7', label: '截图' }
    }
  },

  // 组件方法
  methods: {
    /**
     * 点击卡片 - 触发跳转详情事件
     */
    onTap() {
      const id = this.data.notification.id || this.data.notification._id;
      // 向父组件传递点击事件，携带通知ID
      this.triggerEvent('tap', { id: id });
    },

    /**
     * 获取来源类型显示信息
     * @param {string} type - 来源类型 text/voice/screenshot
     * @returns {object} 图标和标签
     */
    getSourceInfo(type) {
      return this.data.sourceMap[type] || this.data.sourceMap.text;
    }
  }
});
