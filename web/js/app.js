/**
 * 智通知 - Web 应用主逻辑
 * SPA 路由 + 页面渲染 + 事件处理
 */
const App = {
  state: {
    userId: localStorage.getItem('user_id') || '',
    currentPage: null,
    processStatus: 'idle',
    result: null,
    notifId: null,
    styles: [],
    currentStyleKey: 'emoji',
    recentNotifications: [],
    isRecording: false,
    recordDuration: 0,
    recordTimer: null,
    recorder: null,
    recordChunks: [],
    pendingImage: null,
    selectedProject: '全部',
    chatProjects: [],
    notifTags: ['全部'],
    currentTag: '全部',
    notifList: [],
    notifPage: 1,
    notifPageSize: 20,
    notifHasMore: true,
    notifLoading: false,
    detail: null,
    stats: { total: 0, weekly: 0, accuracy: '0%' },
    projects: [],
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    calendarData: {},
    calendarSelectedDate: null,
    todayTodos: null,
    todoDate: null,
  },

  init() {
    if (!this.state.userId) {
      this.state.userId = 'u_' + this.genId();
      localStorage.setItem('user_id', this.state.userId);
    }
    window.addEventListener('hashchange', () => this.router());
    this.router();
  },

  genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  router() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/');
    const page = parts[1] || 'index';
    const param = parts[2] || '';

    document.querySelectorAll('.nav-link').forEach((el) => {
      el.classList.toggle('active', el.dataset.page === page || (page === 'index' && !el.dataset.page));
    });

    const app = document.getElementById('app');
    window.scrollTo(0, 0);

    switch (page) {
      case 'index':
      case '':
        this.renderIndex(app);
        break;
      case 'calendar':
        this.renderCalendar(app);
        break;
      case 'notifications':
        this.renderNotifications(app);
        break;
      case 'profile':
        this.renderProfile(app);
        break;
      default:
        this.renderIndex(app);
    }
  },

  // ================================================================
  //  Utility Functions
  // ================================================================
  el(html) {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
  },

  escape(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },

  sourceIcon(type) {
    return type === 'voice' ? '🎙️' : type === 'screenshot' ? '🖼️' : '✏️';
  },

  notifCard(n) {
    const icon = this.sourceIcon(n.source_type);
    const tag = n.project_tag && n.project_tag !== '未分类'
      ? `<span class="tag" style="background:${n.tag_color || '#007AFF'}">${this.escape(n.project_tag)}</span>`
      : '';
    const time = n.created_at ? this.formatTime(n.created_at) : '';
    return `
      <div class="swipe-container" data-id="${n.id}">
        <div class="swipe-action" onclick="App.confirmDeleteNotif(${n.id})">删除</div>
        <div class="swipe-content notif-card" onclick="App.openDetailModal(${n.id})">
          <div class="notif-header">
            <span class="notif-icon">${icon}</span>
            <span class="notif-title">${this.escape(n.title || '未命名通知')}</span>
            <span class="notif-time">${time}</span>
          </div>
          <div class="notif-content">${this.escape(n.content || '')}</div>
          <div class="notif-footer">${tag}</div>
        </div>
      </div>`;
  },

  attachSwipeEvents(container) {
    container.querySelectorAll('.swipe-container').forEach((item) => {
      const content = item.querySelector('.swipe-content');
      let startX = 0;
      let currentX = 0;
      let dragging = false;
      let opened = false;

      const onStart = (clientX) => {
        startX = clientX;
        dragging = true;
        content.style.transition = 'none';
      };

      const onMove = (clientX) => {
        if (!dragging) return;
        const delta = clientX - startX;
        currentX = delta;
        const offset = opened ? 80 + delta : delta;
        if (offset > 0 && offset <= 80) {
          content.style.transform = `translateX(${offset}px)`;
        } else if (offset <= 0) {
          content.style.transform = `translateX(0px)`;
        } else if (offset > 80) {
          content.style.transform = `translateX(80px)`;
        }
      };

      const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        content.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        if (currentX > 40) {
          opened = true;
          content.style.transform = 'translateX(80px)';
        } else {
          opened = false;
          content.style.transform = 'translateX(0px)';
        }
      };

      content.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
      content.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
      content.addEventListener('touchend', onEnd);

      content.addEventListener('mousedown', (e) => {
        onStart(e.clientX);
        const move = (ev) => onMove(ev.clientX);
        const up = () => {
          onEnd();
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    });
  },

  confirmDeleteNotif(id) {
    const overlay = this.showModal(`
      <div class="modal-content">
        <div class="modal-title" style="color:var(--danger)">确认删除</div>
        <p style="text-align:center;color:var(--muted);font-size:14px;margin-bottom:20px">删除后不可恢复，确定删除这条通知吗？</p>
        <div class="modal-actions">
          <div class="btn" id="del-cancel">取消</div>
          <div class="btn btn-danger" id="del-confirm">删除</div>
        </div>
      </div>`);
    overlay.querySelector('#del-cancel').onclick = () => this.closeModal(overlay);
    overlay.querySelector('#del-confirm').onclick = () => {
      this.closeModal(overlay);
      API.deleteNotification(id).then(() => {
        this.toast('删除成功');
        document.querySelectorAll('.modal-overlay').forEach((o) => o.remove());
        this.loadRecent();
        if (this.state.currentPage === 'notifications') this.loadNotifList(true);
        if (this.state.currentPage === 'calendar') {
          this.loadCalendarData();
          this.loadDateTodos(this.state.todoDate || this.todayStr());
        }
      });
    };
  },

  formatTime(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return '刚刚';
      if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
      if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
      if (diff < 604800) return Math.floor(diff / 86400) + '天前';
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      return '';
    }
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  shiftDate(dateStr, delta) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const today = this.todayStr();
    if (dateStr === today) return '今天';
    const tomorrow = this.shiftDate(today, 1);
    if (dateStr === tomorrow) return '明天';
    const yesterday = this.shiftDate(today, -1);
    if (dateStr === yesterday) return '昨天';
    return `${parseInt(m)}月${parseInt(d)}日`;
  },

  showModal(html) {
    const overlay = this.el(`<div class="modal-overlay">${html}</div>`);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    return overlay;
  },

  closeModal(overlay) {
    if (overlay) overlay.remove();
  },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  },

  // ================================================================
  //  Index Page — 对话框式输入
  // ================================================================
  renderIndex(container) {
    this.state.currentPage = 'index';
    container.innerHTML = `
      <div id="processing-area"></div>
      <div id="result-area"></div>
      <div id="recent-area"></div>
      <div class="chat-spacer"></div>
      <div class="chat-bottom-bar" id="chat-bottom-bar">
        <div class="chat-project-bar" id="chat-project-bar"></div>
        <div class="chat-input-bar" id="chat-bar">
          <div id="chat-image-preview" class="chat-image-preview" style="display:none"></div>
          <div class="chat-input-row">
            <div class="chat-attach" id="btn-attach">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </div>
            <textarea class="chat-textarea" id="chat-text" placeholder="输入通知内容，可直接拖入或粘贴图片…" rows="1"></textarea>
            <div class="chat-mic" id="btn-mic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <div class="chat-send" id="btn-send" style="display:none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <input type="file" id="hidden-file-input" accept="image/*" style="display:none">
    `;

    const textarea = document.getElementById('chat-text');
    const sendBtn = document.getElementById('btn-send');
    const micBtn = document.getElementById('btn-mic');
    const attachBtn = document.getElementById('btn-attach');
    const fileInput = document.getElementById('hidden-file-input');
    const chatBar = document.getElementById('chat-bar');
    const bottomBar = document.getElementById('chat-bottom-bar');

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      sendBtn.style.display = textarea.value.trim() ? 'flex' : 'none';
      micBtn.style.display = textarea.value.trim() ? 'none' : 'flex';
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChatInput();
      }
    });

    sendBtn.onclick = () => this.sendChatInput();
    micBtn.onclick = () => this.toggleRecording();
    attachBtn.onclick = () => fileInput.click();

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleImageFile(e.target.files[0]);
      fileInput.value = '';
    });

    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); bottomBar.classList.add('drag-over'); };
    const handleDragLeave = (e) => { if (e.target === bottomBar) bottomBar.classList.remove('drag-over'); };
    const handleDrop = (e) => {
      e.preventDefault(); e.stopPropagation();
      bottomBar.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) this.handleImageFile(file);
    };
    bottomBar.addEventListener('dragenter', handleDragOver);
    bottomBar.addEventListener('dragover', handleDragOver);
    bottomBar.addEventListener('dragleave', handleDragLeave);
    bottomBar.addEventListener('drop', handleDrop);

    document.addEventListener('paste', (e) => {
      if (this.state.currentPage !== 'index') return;
      const items = e.clipboardData ? e.clipboardData.items : [];
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); this.handleImageFile(file); break; }
        }
      }
    });

    if (this.state.processStatus === 'processing') this.showProcessing();
    if (this.state.processStatus === 'done' && this.state.result) this.showResult(this.state.result);

    this.loadChatProjects();
    this.loadRecent();
  },

  loadChatProjects() {
    API.getProjects()
      .then((data) => {
        const projects = data.list || data || [];
        this.state.chatProjects = projects;
        const bar = document.getElementById('chat-project-bar');
        if (!bar) return;
        const tags = ['全部'].concat(projects.map((p) => p.name));
        let html = tags.map((t) => {
          const proj = projects.find((p) => p.name === t);
          const color = t === '全部' ? '#86868b' : (proj ? proj.color : '#007AFF');
          return `<div class="chat-proj-tag ${t === this.state.selectedProject ? 'active' : ''}" style="--tag-color:${color}" onclick="App.selectChatProject('${this.escape(t)}')">${this.escape(t)}</div>`;
        }).join('');
        html += `<div class="chat-proj-add" onclick="App.showCreateProject()">+ 添加</div>`;
        bar.innerHTML = html;
      })
      .catch(() => {});
  },

  selectChatProject(tag) {
    this.state.selectedProject = tag;
    document.querySelectorAll('.chat-proj-tag').forEach((el) => {
      el.classList.toggle('active', el.textContent === tag);
    });
  },

  handleImageFile(file) {
    this.state.pendingImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('chat-image-preview');
      if (preview) {
        preview.innerHTML = `
          <div class="chat-image-thumb">
            <img src="${e.target.result}">
            <div class="chat-image-remove" onclick="App.removePendingImage()">✕</div>
          </div>`;
        preview.style.display = 'flex';
      }
      const sendBtn = document.getElementById('btn-send');
      if (sendBtn) sendBtn.style.display = 'flex';
      const micBtn = document.getElementById('btn-mic');
      if (micBtn) micBtn.style.display = 'none';
    };
    reader.readAsDataURL(file);
  },

  removePendingImage() {
    this.state.pendingImage = null;
    const preview = document.getElementById('chat-image-preview');
    if (preview) {
      preview.innerHTML = '';
      preview.style.display = 'none';
    }
    const textarea = document.getElementById('chat-text');
    const sendBtn = document.getElementById('btn-send');
    const micBtn = document.getElementById('btn-mic');
    if (textarea && !textarea.value.trim()) {
      if (sendBtn) sendBtn.style.display = 'none';
      if (micBtn) micBtn.style.display = 'flex';
    }
  },

  sendChatInput() {
    const textarea = document.getElementById('chat-text');
    const text = textarea ? textarea.value.trim() : '';
    const image = this.state.pendingImage;

    if (image) {
      if (text) {
        this.submitText(text);
      } else {
        this.uploadScreenshot(image);
      }
      this.removePendingImage();
      if (textarea) textarea.value = '';
      const sendBtn = document.getElementById('btn-send');
      const micBtn = document.getElementById('btn-mic');
      if (sendBtn) sendBtn.style.display = 'none';
      if (micBtn) micBtn.style.display = 'flex';
      return;
    }

    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    const sendBtn = document.getElementById('btn-send');
    const micBtn = document.getElementById('btn-mic');
    if (sendBtn) sendBtn.style.display = 'none';
    if (micBtn) micBtn.style.display = 'flex';
    this.submitText(text);
  },

  loadRecent() {
    API.getNotifications('', 1, 5)
      .then((data) => {
        const list = data.list || data || [];
        this.state.recentNotifications = list;
        const area = document.getElementById('recent-area');
        if (!area) return;
        if (list.length === 0) {
          area.innerHTML = `
            <div class="chat-empty">
              <div class="chat-empty-icon">💬</div>
              <div class="chat-empty-text">输入通知内容，AI 自动识别分类</div>
            </div>`;
          return;
        }
        area.innerHTML = `
          <div class="section-header">
            <span class="section-title">最近处理</span>
            <span class="section-more" onclick="location.hash='#/notifications'">查看全部 ›</span>
          </div>
          ${list.map((n) => this.notifCard(n)).join('')}
        `;
        this.attachSwipeEvents(area);
      })
      .catch(() => {});
  },

  uploadScreenshot(file) {
    this.state.processStatus = 'processing';
    this.showProcessing();
    API.uploadScreenshot(file, this.state.selectedProject)
      .then((data) => {
        this.state.processStatus = 'done';
        this.state.result = data;
        this.state.notifId = data.notification_id;
        this.state.currentStyleKey = 'emoji';
        this.showResult(data);
        this.fetchStyles(data);
        this.loadRecent();
      })
      .catch(() => {
        this.state.processStatus = 'idle';
        this.clearProcessing();
      });
  },

  // --- Voice Recording ---
  async toggleRecording() {
    if (this.state.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  },

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      this.state.recorder = recorder;
      this.state.recordChunks = [];
      this.state.isRecording = true;
      this.state.recordDuration = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.state.recordChunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.state.recordChunks, { type: 'audio/webm' });
        const file = new File([blob], 'audio.webm', { type: 'audio/webm' });
        this.uploadVoice(file);
      };

      recorder.start();
      this.state.recordTimer = setInterval(() => {
        this.state.recordDuration++;
        const el = document.getElementById('rec-timer');
        if (el) el.textContent = this.state.recordDuration + 's';
        if (this.state.recordDuration >= 60) this.stopRecording();
      }, 1000);

      const micBtn = document.getElementById('btn-mic');
      if (micBtn) {
        micBtn.classList.add('recording');
        micBtn.innerHTML = `
          <div class="rec-pulse"></div>
          <span id="rec-timer" class="rec-timer-text">0s</span>
          <div class="rec-stop-icon">⏹</div>`;
      }
    } catch (err) {
      this.toast('无法访问麦克风，请检查权限');
    }
  },

  stopRecording() {
    if (this.state.recorder && this.state.isRecording) {
      this.state.recorder.stop();
      this.state.isRecording = false;
      if (this.state.recordTimer) {
        clearInterval(this.state.recordTimer);
        this.state.recordTimer = null;
      }
      const micBtn = document.getElementById('btn-mic');
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>`;
      }
    }
  },

  uploadVoice(file) {
    this.state.processStatus = 'processing';
    this.showProcessing();
    API.uploadVoice(file, this.state.selectedProject)
      .then((data) => {
        this.state.processStatus = 'done';
        this.state.result = data;
        this.state.notifId = data.notification_id;
        this.state.currentStyleKey = 'emoji';
        this.showResult(data);
        this.fetchStyles(data);
        this.loadRecent();
      })
      .catch(() => {
        this.state.processStatus = 'idle';
        this.clearProcessing();
      });
  },

  submitText(text) {
    this.state.processStatus = 'processing';
    this.showProcessing();
    API.submitText(text, this.state.selectedProject)
      .then((data) => {
        this.state.processStatus = 'done';
        this.state.result = data;
        this.state.notifId = data.notification_id;
        this.state.currentStyleKey = 'emoji';
        this.showResult(data);
        this.fetchStyles(data);
        this.loadRecent();
      })
      .catch(() => {
        this.state.processStatus = 'idle';
        this.clearProcessing();
      });
  },

  showProcessing() {
    const area = document.getElementById('processing-area');
    if (area) {
      area.innerHTML = `
        <div class="processing">
          <div class="spinner"></div>
          <div class="processing-text">AI 正在识别处理中</div>
          <div class="processing-sub">提取标题、内容、自动分类</div>
        </div>`;
    }
    const resultArea = document.getElementById('result-area');
    if (resultArea) resultArea.innerHTML = '';
  },

  clearProcessing() {
    const area = document.getElementById('processing-area');
    if (area) area.innerHTML = '';
  },

  // --- Style Selection ---
  fetchStyles(data) {
    API.generateStyles(data.title, data.content)
      .then((res) => {
        this.state.styles = res.styles || [];
        this.renderStyleSelector();
      })
      .catch(() => {});
  },

  renderStyleSelector() {
    const container = document.getElementById('style-selector');
    if (!container || this.state.styles.length === 0) return;
    container.innerHTML = this.state.styles
      .map((s) => `
        <div class="style-tab ${s.key === this.state.currentStyleKey ? 'active' : ''}"
             onclick="App.selectStyle('${s.key}')">${this.escape(s.label)}</div>`)
      .join('');
  },

  selectStyle(key) {
    this.state.currentStyleKey = key;
    const style = this.state.styles.find((s) => s.key === key);
    if (!style) return;
    const contentEl = document.getElementById('result-content');
    if (contentEl) contentEl.textContent = style.content;
    document.querySelectorAll('.style-tab').forEach((el) => {
      el.classList.toggle('active', el.textContent.trim() === style.label);
    });
    if (this.state.notifId) {
      API.updateNotification(this.state.notifId, style.content)
        .then(() => { this.toast('已切换风格'); })
        .catch(() => {});
    }
  },

  showResult(data) {
    this.clearProcessing();
    const area = document.getElementById('result-area');
    if (!area) return;
    const tag = data.project_tag && data.project_tag !== '未分类'
      ? `<div class="result-row"><span class="result-label">分类</span><span class="tag" style="background:${data.tag_color || '#007AFF'}">${this.escape(data.project_tag)}</span></div>`
      : '';
    area.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <span class="result-title">处理完成</span>
          <span class="result-close" onclick="App.closeResult()">✕</span>
        </div>
        <div class="result-row"><span class="result-label">标题</span><span class="result-value">${this.escape(data.title || '未提取到标题')}</span></div>
        <div class="result-row"><span class="result-label">内容</span><span class="result-value" id="result-content">${this.escape(data.content || '未提取到内容')}</span></div>
        ${tag}
        <div class="style-section">
          <div class="style-label">选择风格</div>
          <div class="style-tabs" id="style-selector"></div>
        </div>
        <div class="result-actions">
          <div class="btn btn-block btn-primary" onclick="App.closeResult()">完成</div>
        </div>
      </div>`;
  },

  closeResult() {
    this.state.processStatus = 'idle';
    this.state.result = null;
    this.state.styles = [];
    const area = document.getElementById('result-area');
    if (area) area.innerHTML = '';
  },

  // ================================================================
  //  Notifications Page
  // ================================================================
  renderNotifications(container) {
    this.state.currentPage = 'notifications';
    container.innerHTML = `
      <div class="page-title">项目</div>
      <div class="tag-bar" id="tag-bar"></div>
      <div id="notif-list"></div>
      <div id="load-more-area"></div>
    `;
    this.loadNotifTags();
    this.loadNotifList(true);

    window.onscroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
        if (this.state.notifHasMore && !this.state.notifLoading) {
          this.loadNotifList(false);
        }
      }
    };
  },

  loadNotifTags() {
    API.getProjects()
      .then((data) => {
        const projects = data.list || data || [];
        const tags = ['全部'].concat(projects.map((p) => p.name));
        this.state.notifTags = tags;
        const bar = document.getElementById('tag-bar');
        if (bar) {
          bar.innerHTML = tags
            .map((t) => `<div class="tag-item ${t === this.state.currentTag ? 'active' : ''}" onclick="App.selectTag('${this.escape(t)}')">${this.escape(t)}</div>`)
            .join('');
        }
      })
      .catch(() => {});
  },

  selectTag(tag) {
    if (tag === this.state.currentTag) return;
    this.state.currentTag = tag;
    this.state.notifList = [];
    this.state.notifPage = 1;
    this.state.notifHasMore = true;
    document.querySelectorAll('.tag-item').forEach((el) => {
      el.classList.toggle('active', el.textContent === tag);
    });
    this.loadNotifList(true);
  },

  loadNotifList(refresh) {
    if (this.state.notifLoading) return;
    const page = refresh ? 1 : this.state.notifPage + 1;
    this.state.notifLoading = true;

    if (refresh) {
      const list = document.getElementById('notif-list');
      if (list) list.innerHTML = '';
    }

    API.getNotifications(this.state.currentTag, page, this.state.notifPageSize)
      .then((data) => {
        const list = data.list || data || [];
        this.state.notifHasMore = list.length >= this.state.notifPageSize;
        this.state.notifList = refresh ? list : this.state.notifList.concat(list);
        this.state.notifPage = page;
        this.state.notifLoading = false;

        const container = document.getElementById('notif-list');
        if (container) {
          if (refresh) container.innerHTML = '';
          if (this.state.notifList.length === 0) {
            container.innerHTML = `
              <div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-text">暂无通知记录</div>
                <div class="empty-sub">去首页添加通知吧</div>
              </div>`;
          } else {
            container.insertAdjacentHTML('beforeend', list.map((n) => this.notifCard(n)).join(''));
            this.attachSwipeEvents(container);
          }
        }

        const more = document.getElementById('load-more-area');
        if (more) {
          if (this.state.notifLoading) {
            more.innerHTML = `<div class="load-more"><div class="spinner"></div>加载中</div>`;
          } else if (!this.state.notifHasMore && this.state.notifList.length > 0) {
            more.innerHTML = `<div class="load-more" style="color:#aaa">没有更多了</div>`;
          } else {
            more.innerHTML = '';
          }
        }
      })
      .catch(() => {
        this.state.notifLoading = false;
      });
  },

  // ================================================================
  //  Detail Modal — 弹窗式通知详情
  // ================================================================
  openDetailModal(id) {
    const overlay = this.showModal(`
      <div class="modal-content detail-modal">
        <div class="processing"><div class="spinner"></div><div class="processing-text">加载中</div></div>
      </div>`);
    overlay.dataset.detailId = id;

    API.getNotificationDetail(id)
      .then((data) => {
        this.state.detail = data;
        const icon = this.sourceIcon(data.source_type);
        const sourceLabel = data.source_type === 'voice' ? '语音输入' : data.source_type === 'screenshot' ? '图片识别' : '文字输入';
        const tag = data.project_tag && data.project_tag !== '未分类'
          ? `<span class="tag" style="background:${data.tag_color || '#007AFF'}">${this.escape(data.project_tag)}</span>`
          : '';
        const time = data.created_at ? this.formatTime(data.created_at) : '';
        const content = overlay.querySelector('.modal-content');
        if (!content) return;
        content.innerHTML = `
          <div class="detail-modal-header">
            <span class="detail-modal-title">${this.escape(data.title || '未命名通知')}</span>
            <span class="detail-modal-close" onclick="App.closeModal(this.closest('.modal-overlay'))">✕</span>
          </div>
          <div class="detail-modal-meta">
            <span>${icon} ${sourceLabel}</span>
            ${tag}
            <span style="margin-left:auto">${time}</span>
          </div>
          <div class="detail-modal-section">
            <div class="detail-modal-label">通知内容</div>
            <div class="detail-modal-content">${this.escape(data.content || '暂无内容')}</div>
            <div class="copy-btn" onclick="App.copyContent()">复制内容</div>
          </div>
          ${data.raw_content ? `
          <div class="detail-modal-section">
            <div class="detail-modal-label">原始内容</div>
            <div class="detail-modal-raw">${this.escape(data.raw_content)}</div>
          </div>` : ''}
          <div class="detail-modal-actions">
            <div class="btn btn-block btn-danger" onclick="App.confirmDeleteNotif(${data.id})">删除通知</div>
          </div>`;
      })
      .catch(() => {
        const content = overlay.querySelector('.modal-content');
        if (content) {
          content.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><div class="empty-text">通知不存在或已删除</div></div>`;
        }
      });
  },

  copyContent() {
    if (this.state.detail && this.state.detail.content) {
      navigator.clipboard.writeText(this.state.detail.content).then(() => {
        this.toast('已复制');
      });
    }
  },

  // ================================================================
  //  Profile Page
  // ================================================================
  renderProfile(container) {
    this.state.currentPage = 'profile';
    window.onscroll = null;
    container.innerHTML = `
      <div class="page-title">个人中心</div>
      <div class="card user-card">
        <div class="user-avatar">👤</div>
        <div>
          <div class="user-name">智通知用户</div>
          <div class="user-id">ID: ${this.state.userId}</div>
        </div>
      </div>
      <div class="card">
        <div class="stats-row" id="stats-row">
          <div class="stats-item"><div class="stats-value">-</div><div class="stats-label">累计处理</div></div>
          <div class="stats-divider"></div>
          <div class="stats-item"><div class="stats-value">-</div><div class="stats-label">本周处理</div></div>
          <div class="stats-divider"></div>
          <div class="stats-item"><div class="stats-value">-</div><div class="stats-label">分类准确率</div></div>
        </div>
      </div>
      <div class="card">
        <div class="section-header">
          <span class="section-title" style="font-size:16px">项目标签</span>
          <span class="section-add" onclick="App.showCreateProject()">+ 新建</span>
        </div>
        <div class="project-list" id="project-list"></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="menu-item" onclick="App.showAbout()">
          <span class="menu-icon">ℹ️</span>
          <span class="menu-text">关于智通知</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" onclick="App.clearCache()">
          <span class="menu-icon">🗑️</span>
          <span class="menu-text">清除缓存</span>
          <span class="menu-arrow">›</span>
        </div>
      </div>
    `;
    this.loadStats();
    this.loadProjectsForProfile();
  },

  loadStats() {
    API.getStatistics()
      .then((data) => {
        this.state.stats = {
          total: data.total || 0,
          weekly: data.weekly || 0,
          accuracy: (data.accuracy || 0) + '%',
        };
        const row = document.getElementById('stats-row');
        if (row) {
          row.innerHTML = `
            <div class="stats-item"><div class="stats-value">${this.state.stats.total}</div><div class="stats-label">累计处理</div></div>
            <div class="stats-divider"></div>
            <div class="stats-item"><div class="stats-value">${this.state.stats.weekly}</div><div class="stats-label">本周处理</div></div>
            <div class="stats-divider"></div>
            <div class="stats-item"><div class="stats-value">${this.state.stats.accuracy}</div><div class="stats-label">分类准确率</div></div>`;
        }
      })
      .catch(() => {});
  },

  loadProjectsForProfile() {
    API.getProjects()
      .then((data) => {
        const list = data.list || data || [];
        this.state.projects = list;
        const container = document.getElementById('project-list');
        if (!container) return;
        if (list.length === 0) {
          container.innerHTML = `<div class="project-empty">暂无项目，点击右上角"新建"添加</div>`;
          return;
        }
        container.innerHTML = list
          .map((p) => `<div class="project-item">
            <div class="project-dot" style="background:${p.color || '#007AFF'}"></div>
            <div class="project-info">
              <div class="project-name">${this.escape(p.name)}</div>
              ${p.notes ? `<div class="project-notes">${this.escape(p.notes)}</div>` : ''}
            </div>
            ${p.count != null ? `<span class="project-count">${p.count}</span>` : ''}
          </div>`)
          .join('');
      })
      .catch(() => {});
  },

  showCreateProject() {
    const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#5AC8FA', '#5856D6'];
    let selectedColor = '#007AFF';
    const overlay = this.showModal(`
      <div class="modal-content">
        <div class="modal-title">新建项目</div>
        <div class="form-group">
          <label class="form-label">项目名称</label>
          <input class="modal-input" id="project-name" placeholder="请输入项目名称" maxlength="20" />
        </div>
        <div class="form-group">
          <label class="form-label">备注（可选）</label>
          <textarea class="modal-textarea" id="project-notes" placeholder="项目说明、用途等" maxlength="200" style="min-height:80px"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">标签颜色</label>
          <div class="color-list" id="color-list">
            ${colors.map((c) => `<div class="color-item ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="App.selectColor('${c}')">${c === selectedColor ? '<span class="color-check">✓</span>' : ''}</div>`).join('')}
          </div>
        </div>
        <div class="modal-actions">
          <div class="btn" id="proj-cancel">取消</div>
          <div class="btn btn-primary" id="proj-submit">创建</div>
        </div>
      </div>`);
    this.state._selectedColor = selectedColor;
    overlay.querySelector('#proj-cancel').onclick = () => this.closeModal(overlay);
    overlay.querySelector('#proj-submit').onclick = () => {
      const name = document.getElementById('project-name').value.trim();
      const notes = document.getElementById('project-notes').value.trim();
      if (!name) { this.toast('请输入项目名称'); return; }
      API.createProject(name, this.state._selectedColor || selectedColor, notes).then(() => {
        this.closeModal(overlay);
        this.toast('创建成功');
        this.loadProjectsForProfile();
        this.loadChatProjects();
      });
    };
  },

  selectColor(color) {
    this.state._selectedColor = color;
    document.querySelectorAll('.color-item').forEach((el) => {
      const isSelected = el.dataset.color === color;
      el.classList.toggle('selected', isSelected);
      el.innerHTML = isSelected ? '<span class="color-check">✓</span>' : '';
    });
  },

  showAbout() {
    const overlay = this.showModal(`
      <div class="modal-content">
        <div class="modal-title">关于智通知</div>
        <p style="font-size:14px;line-height:1.8;color:#555">
          版本：v2.1.0<br/><br/>
          智通知是一款智能通知识别与管理工具。支持图片、语音、文字输入，由AI自动识别、提取、分类并生成多种风格的通知。<br/><br/>
          让团队通知不再遗漏。
        </p>
        <div class="modal-actions">
          <div class="btn btn-block btn-primary" onclick="App.closeModal(this.closest('.modal-overlay'))">知道了</div>
        </div>
      </div>`);
  },

  clearCache() {
    const overlay = this.showModal(`
      <div class="modal-content">
        <div class="modal-title">清除缓存</div>
        <p style="text-align:center;color:var(--muted);font-size:14px;margin-bottom:20px">确定清除本地缓存数据吗？</p>
        <div class="modal-actions">
          <div class="btn" id="cache-cancel">取消</div>
          <div class="btn btn-danger" id="cache-confirm">清除</div>
        </div>
      </div>`);
    overlay.querySelector('#cache-cancel').onclick = () => this.closeModal(overlay);
    overlay.querySelector('#cache-confirm').onclick = () => {
      this.closeModal(overlay);
      localStorage.removeItem('user_id');
      this.state.userId = 'u_' + this.genId();
      localStorage.setItem('user_id', this.state.userId);
      this.toast('清除成功');
      setTimeout(() => this.router(), 800);
    };
  },

  // ================================================================
  //  Calendar Page — 月历 + 待办清单（左右布局）+ 按日查看
  // ================================================================
  renderCalendar(container) {
    this.state.currentPage = 'calendar';
    window.onscroll = null;
    if (!this.state.todoDate) this.state.todoDate = this.todayStr();
    container.innerHTML = `
      <div class="page-title">日历</div>
      <div class="calendar-layout">
        <div class="calendar-todo-panel">
          <div class="todo-nav-header">
            <div class="todo-nav-btn" onclick="App.prevTodoDate()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </div>
            <div class="todo-nav-label" id="todo-date-label"></div>
            <div class="todo-nav-btn" onclick="App.nextTodoDate()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
          <div id="calendar-todos"></div>
        </div>
        <div class="calendar-main-panel">
          <div class="calendar-card">
            <div class="calendar-header">
              <div class="calendar-nav" onclick="App.prevMonth()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </div>
              <div class="calendar-month" id="cal-month-label"></div>
              <div class="calendar-nav" onclick="App.nextMonth()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
            <div class="calendar-weekdays">
              <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>
            <div class="calendar-grid" id="calendar-grid"></div>
          </div>
          <div id="calendar-date-detail"></div>
        </div>
      </div>
    `;
    this.loadCalendarData();
    this.loadDateTodos(this.state.todoDate);
  },

  loadCalendarData() {
    const { calendarYear: year, calendarMonth: month } = this.state;
    const monthLabel = document.getElementById('cal-month-label');
    if (monthLabel) monthLabel.textContent = `${year}年${month}月`;

    const grid = document.getElementById('calendar-grid');
    if (grid) grid.innerHTML = '<div class="calendar-loading"><div class="spinner" style="width:24px;height:24px;border-width:2px"></div></div>';

    API.getCalendar(year, month)
      .then((data) => {
        this.state.calendarData = data.dates || {};
        this.renderCalendarGrid();
      })
      .catch(() => {
        if (grid) grid.innerHTML = '<div class="calendar-loading">加载失败</div>';
      });
  },

  renderCalendarGrid() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const { calendarYear: year, calendarMonth: month, calendarData, todoDate } = this.state;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() === year && today.getMonth() + 1 === month
      ? `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      : null;

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const notifs = calendarData[dateStr] || [];
      const hasNotif = notifs.length > 0;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === todoDate;
      html += `<div class="calendar-day${hasNotif ? ' has-notif' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${dateStr}" ${hasNotif ? `onclick="App.selectTodoDate('${dateStr}')"` : ''}>
        <span class="cal-day-num">${d}</span>
        ${hasNotif ? `<span class="cal-day-dot"></span>` : ''}
        ${hasNotif ? `<span class="cal-day-count">${notifs.length}</span>` : ''}
      </div>`;
    }
    grid.innerHTML = html;
  },

  prevMonth() {
    if (this.state.calendarMonth === 1) {
      this.state.calendarMonth = 12;
      this.state.calendarYear--;
    } else {
      this.state.calendarMonth--;
    }
    this.state.calendarSelectedDate = null;
    const detail = document.getElementById('calendar-date-detail');
    if (detail) detail.innerHTML = '';
    this.loadCalendarData();
  },

  nextMonth() {
    if (this.state.calendarMonth === 12) {
      this.state.calendarMonth = 1;
      this.state.calendarYear++;
    } else {
      this.state.calendarMonth++;
    }
    this.state.calendarSelectedDate = null;
    const detail = document.getElementById('calendar-date-detail');
    if (detail) detail.innerHTML = '';
    this.loadCalendarData();
  },

  selectTodoDate(date) {
    this.state.todoDate = date;
    this.state.calendarSelectedDate = date;
    document.querySelectorAll('.calendar-day').forEach((el) => {
      el.classList.toggle('selected', el.dataset.date === date);
    });
    this.loadDateNotifications(date);
    this.loadDateTodos(date);
  },

  prevTodoDate() {
    this.state.todoDate = this.shiftDate(this.state.todoDate, -1);
    this.loadDateTodos(this.state.todoDate);
    this.highlightCalendarDay();
  },

  nextTodoDate() {
    this.state.todoDate = this.shiftDate(this.state.todoDate, 1);
    this.loadDateTodos(this.state.todoDate);
    this.highlightCalendarDay();
  },

  highlightCalendarDay() {
    const { todoDate, calendarYear, calendarMonth } = this.state;
    const [y, m] = todoDate.split('-');
    if (parseInt(y) === calendarYear && parseInt(m) === calendarMonth) {
      document.querySelectorAll('.calendar-day').forEach((el) => {
        el.classList.toggle('selected', el.dataset.date === todoDate);
      });
    }
  },

  loadDateNotifications(date) {
    this.state.calendarSelectedDate = date;
    const detail = document.getElementById('calendar-date-detail');
    if (!detail) return;

    const notifs = this.state.calendarData[date] || [];
    if (notifs.length === 0) {
      detail.innerHTML = '';
      return;
    }

    const dateLabel = this.formatDateLabel(date);
    detail.innerHTML = `
      <div class="calendar-date-header">
        <span class="calendar-date-title">${dateLabel} 的通知</span>
        <span class="calendar-date-count">${notifs.length} 条</span>
      </div>
      ${notifs.map((n) => this.notifCard(n)).join('')}
    `;
    this.attachSwipeEvents(detail);
  },

  loadDateTodos(date) {
    const labelEl = document.getElementById('todo-date-label');
    if (labelEl) labelEl.textContent = this.formatDateLabel(date);

    const container = document.getElementById('calendar-todos');
    if (!container) return;

    container.innerHTML = '<div class="todo-loading"><div class="spinner" style="width:24px;height:24px;border-width:2px"></div></div>';

    API.getDateTodos(date)
      .then((data) => {
        this.renderDateTodos(data, date);
      })
      .catch(() => {
        container.innerHTML = '<div class="todo-empty"><div class="todo-empty-icon">⚠️</div><div class="todo-empty-text">加载失败</div></div>';
      });
  },

  renderDateTodos(data, date) {
    const container = document.getElementById('calendar-todos');
    if (!container) return;

    const dayList = data.today || [];
    const deadlineList = data.deadlines || [];

    if (dayList.length === 0 && deadlineList.length === 0) {
      container.innerHTML = `
        <div class="todo-empty">
          <div class="todo-empty-icon">📋</div>
          <div class="todo-empty-text">${this.formatDateLabel(date)}暂无待办</div>
        </div>`;
      return;
    }

    let html = '';
    if (dayList.length > 0) {
      html += `<div class="todo-section-label">当日通知 (${dayList.length})</div>`;
      html += dayList.map((n) => this.todoItem(n)).join('');
    }
    if (deadlineList.length > 0) {
      html += `<div class="todo-section-label">📅 提及此日的通知 (${deadlineList.length})</div>`;
      html += deadlineList.map((n) => this.todoItem(n)).join('');
    }
    container.innerHTML = html;
  },

  todoItem(n) {
    const icon = this.sourceIcon(n.source_type);
    const tag = n.project_tag && n.project_tag !== '未分类'
      ? `<span class="todo-item-tag">${this.escape(n.project_tag)}</span>`
      : '';
    return `
      <div class="todo-item" onclick="App.openDetailModal(${n.id})">
        <div class="todo-item-icon">${icon}</div>
        <div class="todo-item-body">
          <div class="todo-item-title">${this.escape(n.title || '未命名通知')}</div>
          <div class="todo-item-content">${this.escape((n.content || '').slice(0, 80))}${(n.content || '').length > 80 ? '…' : ''}</div>
          <div class="todo-item-footer">${tag}</div>
        </div>
        <div class="todo-item-arrow">›</div>
      </div>`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
