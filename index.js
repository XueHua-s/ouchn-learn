// ==UserScript==
// @name         国家开放大学视频一键挂机脚本+资源下载
// @namespace    http://tampermonkey.net/
// @version      2024-11-03
// @description  国家开放大学视频一键挂机脚本，新增课件/视频一键下载功能
// @author       OrangeMinus + Enhanced
// @match        https://lms.ouchn.cn/course/**
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ouchn.cn
// @require https://cdn.bootcss.com/jquery/3.4.1/jquery.min.js
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 新增：添加样式 ====================
    const style = document.createElement('style');
    style.textContent = `
        /* 下载面板样式 */
        .download-panel {
            position: fixed;
            top: 80px;
            right: 20px;
            width: 320px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 999998;
            font-family: 'Microsoft YaHei', Arial, sans-serif;
        }

        .download-header {
            background: rgba(0,0,0,0.2);
            padding: 12px 15px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 12px 12px 0 0;
        }

        .download-title {
            color: #fff;
            font-size: 16px;
            font-weight: bold;
            margin: 0;
        }

        .download-toggle {
            background: none;
            border: none;
            color: #fff;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
        }

        .download-body {
            padding: 15px;
            background: #fff;
            max-height: 500px;
            overflow-y: auto;
            border-radius: 0 0 12px 12px;
        }

        .download-body.collapsed {
            display: none;
        }

        .download-btn {
            width: 100%;
            padding: 10px;
            margin: 6px 0;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }

        .download-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
        }

        .download-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .download-btn-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            color: #fff;
        }

        .download-btn-success:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(56, 239, 125, 0.4);
        }

        .download-status {
            padding: 8px;
            margin: 8px 0;
            border-radius: 6px;
            font-size: 12px;
            text-align: center;
        }

        .download-status-info {
            background: #e3f2fd;
            color: #1976d2;
        }

        .download-status-success {
            background: #e8f5e9;
            color: #388e3c;
        }

        .download-status-warning {
            background: #fff3e0;
            color: #f57c00;
        }

        .resource-list {
            max-height: 300px;
            overflow-y: auto;
            margin: 10px 0;
        }

        .resource-item {
            padding: 8px;
            margin: 5px 0;
            background: #f9f9f9;
            border-radius: 6px;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 3px solid #667eea;
        }

        .resource-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-right: 8px;
        }

        .resource-download-btn {
            padding: 4px 10px;
            background: #667eea;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            white-space: nowrap;
        }

        .resource-download-btn:hover {
            background: #5568d3;
        }
    `;
    document.head.appendChild(style);

    // ==================== 新增：创建下载面板 ====================
    function createDownloadPanel() {
        const panel = $(`
            <div class="download-panel">
                <div class="download-header">
                    <h3 class="download-title">📥 资源下载</h3>
                    <button class="download-toggle">−</button>
                </div>
                <div class="download-body">
                    <div class="download-status download-status-info" id="download-status">
                        等待扫描资源...
                    </div>

                    <button class="download-btn download-btn-primary" id="scan-resources-btn">
                        🔍 扫描当前页面资源
                    </button>

                    <button class="download-btn download-btn-success" id="download-all-btn" style="display:none;">
                        📦 下载全部资源
                    </button>

                    <div class="resource-list" id="resource-list" style="display:none;"></div>

                    <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">

                    <button class="download-btn download-btn-primary" id="auto-view-pages-btn">
                        👀 一键查看所有页面
                    </button>

                    <div class="download-status download-status-info" id="auto-view-status" style="display:none;">
                        准备开始...
                    </div>

                    <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">

                    <div style="margin: 10px 0;">
                        <label style="font-size: 12px; color: #666; display: flex; align-items: center; justify-content: space-between;">
                            <span>挂机间隔(秒):</span>
                            <input type="number" id="auto-hang-interval" value="30" min="10" max="300"
                                   style="width: 80px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
                        </label>
                    </div>

                    <button class="download-btn download-btn-success" id="auto-hang-all-btn">
                        🎬 一键全部挂机
                    </button>

                    <div class="download-status download-status-info" id="auto-hang-status" style="display:none;">
                        准备开始...
                    </div>
                </div>
            </div>
        `);

        $('body').append(panel);

        // 绑定折叠事件
        panel.find('.download-toggle').on('click', function() {
            const body = panel.find('.download-body');
            body.toggleClass('collapsed');
            $(this).text(body.hasClass('collapsed') ? '+' : '−');
        });

        // 绑定扫描按钮
        $('#scan-resources-btn').on('click', scanResources);

        // 绑定下载全部按钮
        $('#download-all-btn').on('click', downloadAllResources);

        // 绑定一键查看页面按钮
        $('#auto-view-pages-btn').on('click', startAutoViewPages);

        // 绑定一键全部挂机按钮
        $('#auto-hang-all-btn').on('click', startAutoHangAll);

        // 使面板可拖动
        makeDraggable(panel[0]);
    }

    // 使面板可拖动
    function makeDraggable(element) {
        const header = $(element).find('.download-header')[0];
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.onmousedown = function(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + 'px';
            element.style.right = '';
            element.style.left = (element.offsetLeft - pos1) + 'px';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // 更新状态
    function updateStatus(message, type = 'info') {
        $('#download-status')
            .text(message)
            .removeClass('download-status-info download-status-success download-status-warning')
            .addClass(`download-status-${type}`);
        console.log(`[资源下载] ${message}`);
    }

    // 扫描资源
    let allResources = [];
    function scanResources() {
        updateStatus('正在扫描资源...', 'info');
        allResources = [];

        // 1. 扫描视频资源
        $('video').each(function() {
            const video = $(this);
            let src = video.attr('src') || video.find('source').attr('src');

            if (src && src.startsWith('http')) {
                allResources.push({
                    type: 'video',
                    icon: '🎬',
                    name: extractFileName(src) || '视频文件',
                    url: src
                });
            }
        });

        // 2. 扫描文档资源（PDF、PPT、Word等）
        $('a[href]').each(function() {
            const link = $(this);
            const href = link.attr('href');

            if (href && /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt)$/i.test(href)) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, window.location.href).href;
                allResources.push({
                    type: 'document',
                    icon: '📄',
                    name: link.text().trim() || extractFileName(fullUrl),
                    url: fullUrl
                });
            }
        });

        // 3. 扫描音频资源
        $('audio').each(function() {
            const audio = $(this);
            let src = audio.attr('src') || audio.find('source').attr('src');

            if (src && src.startsWith('http')) {
                allResources.push({
                    type: 'audio',
                    icon: '🎵',
                    name: extractFileName(src) || '音频文件',
                    url: src
                });
            }
        });

        // 4. 扫描可能的课件链接
        $('a[href*="resource"], a[href*="courseware"], a[href*="material"]').each(function() {
            const link = $(this);
            const href = link.attr('href');

            if (href && href.startsWith('http')) {
                allResources.push({
                    type: 'courseware',
                    icon: '📚',
                    name: link.text().trim() || '课件资源',
                    url: href
                });
            }
        });

        // 去重
        allResources = allResources.filter((resource, index, self) =>
            index === self.findIndex((r) => r.url === resource.url)
        );

        // 显示结果
        displayResources();
    }

    // 显示资源列表
    function displayResources() {
        const listEl = $('#resource-list');
        listEl.empty();

        if (allResources.length === 0) {
            listEl.html('<div style="text-align:center;padding:20px;color:#999;">未找到可下载的资源</div>');
            listEl.show();
            updateStatus('未找到可下载的资源', 'warning');
            $('#download-all-btn').hide();
            return;
        }

        updateStatus(`找到 ${allResources.length} 个资源`, 'success');
        $('#download-all-btn').show();

        allResources.forEach((resource, index) => {
            const item = $(`
                <div class="resource-item">
                    <span class="resource-name" title="${resource.name}">
                        ${resource.icon} ${resource.name}
                    </span>
                    <button class="resource-download-btn" data-index="${index}">下载</button>
                </div>
            `);

            item.find('.resource-download-btn').on('click', function() {
                const idx = $(this).data('index');
                downloadResource(allResources[idx]);
            });

            listEl.append(item);
        });

        listEl.show();
    }

    // 下载单个资源
    function downloadResource(resource) {
        updateStatus(`正在下载: ${resource.name}`, 'info');
        console.log('[资源下载] 开始下载:', resource);

        // 使用 GM_download 或降级方案
        if (typeof GM_download !== 'undefined') {
            GM_download({
                url: resource.url,
                name: resource.name,
                onload: function() {
                    updateStatus(`下载成功: ${resource.name}`, 'success');
                },
                onerror: function(error) {
                    console.error('[资源下载] 下载失败:', error);
                    fallbackDownload(resource.url, resource.name);
                }
            });
        } else {
            fallbackDownload(resource.url, resource.name);
        }
    }

    // 降级下载方案
    function fallbackDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        updateStatus(`已触发下载: ${filename}`, 'success');
    }

    // 下载全部资源
    function downloadAllResources() {
        if (allResources.length === 0) {
            updateStatus('没有可下载的资源', 'warning');
            return;
        }

        updateStatus(`开始批量下载 ${allResources.length} 个资源...`, 'info');

        allResources.forEach((resource, index) => {
            setTimeout(() => {
                downloadResource(resource);
            }, index * 1000); // 每个资源间隔1秒，避免浏览器阻止
        });
    }

    // 提取文件名
    function extractFileName(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop();
            return decodeURIComponent(filename) || '未命名文件';
        } catch (e) {
            return '未命名文件';
        }
    }

    // ==================== 新增：一键查看所有页面功能 ====================
    let isAutoViewing = false;
    let viewPageQueue = [];
    let currentViewIndex = 0;
    const STORAGE_KEY = 'gk_auto_view_state';
    const RETURN_URL_KEY = 'gk_return_url';

    // localStorage 状态管理
    function saveViewState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('[自动查看页面] 状态已保存:', state);
        } catch (e) {
            console.error('[自动查看页面] 保存状态失败:', e);
        }
    }

    function getViewState() {
        try {
            const state = localStorage.getItem(STORAGE_KEY);
            return state ? JSON.parse(state) : null;
        } catch (e) {
            console.error('[自动查看页面] 读取状态失败:', e);
            return null;
        }
    }

    function clearViewState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(RETURN_URL_KEY);
            console.log('[自动查看页面] 状态已清除');
        } catch (e) {
            console.error('[自动查看页面] 清除状态失败:', e);
        }
    }

    // 更新自动查看状态
    function updateAutoViewStatus(message, type = 'info') {
        const statusEl = $('#auto-view-status');
        statusEl.show()
            .text(message)
            .removeClass('download-status-info download-status-success download-status-warning')
            .addClass(`download-status-${type}`);
        console.log(`[自动查看页面] ${message}`);
    }

    // 等待DOM稳定（没有变化）
    function waitForDomStable(timeout = 10000, stableTime = 1000) {
        return new Promise((resolve) => {
            let lastChangeTime = Date.now();
            let mutationCount = 0;
            const startTime = Date.now();

            console.log('[自动查看页面] 开始监控DOM变化...');

            // 创建 MutationObserver 监控DOM变化
            const observer = new MutationObserver((mutations) => {
                mutationCount += mutations.length;
                lastChangeTime = Date.now();
                console.log(`[自动查看页面] 检测到DOM变化，总计 ${mutationCount} 次变化`);
            });

            // 监控整个body的变化
            observer.observe(document.body, {
                childList: true,      // 监控子节点的增删
                subtree: true,        // 监控所有后代节点
                attributes: true,     // 监控属性变化
                characterData: true   // 监控文本内容变化
            });

            // 定期检查DOM是否稳定
            const checkInterval = setInterval(() => {
                const now = Date.now();
                const timeSinceLastChange = now - lastChangeTime;
                const totalTime = now - startTime;

                console.log(`[自动查看页面] DOM稳定检查: 距离上次变化 ${timeSinceLastChange}ms`);

                // 检查是否稳定（在stableTime内没有变化）
                if (timeSinceLastChange >= stableTime) {
                    console.log(`[自动查看页面] DOM已稳定 (${stableTime}ms 内无变化，总计 ${mutationCount} 次变化)`);
                    observer.disconnect();
                    clearInterval(checkInterval);
                    resolve();
                } else if (totalTime >= timeout) {
                    // 超时保护
                    console.log(`[自动查看页面] DOM监控超时 (${timeout}ms)，强制继续`);
                    observer.disconnect();
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 200); // 每200ms检查一次
        });
    }

    // 等待AJAX请求完成
    function waitForAjaxComplete() {
        return new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 50; // 最多检查50次（10秒）

            function checkAjax() {
                checkCount++;
                const activeRequests = $.active || 0;

                console.log(`[自动查看页面] 检查AJAX状态 (${checkCount}/${maxChecks}): 活动请求数 = ${activeRequests}`);

                if (activeRequests === 0) {
                    // 没有活动的AJAX请求
                    console.log('[自动查看页面] AJAX请求已完成');
                    resolve();
                } else if (checkCount >= maxChecks) {
                    // 超时，强制继续
                    console.log('[自动查看页面] AJAX等待超时，强制继续');
                    resolve();
                } else {
                    // 还有请求在进行，200ms后再检查
                    setTimeout(checkAjax, 200);
                }
            }

            // 开始检查
            checkAjax();
        });
    }

    // 等待页面完全加载（AJAX + DOM稳定）
    async function waitForPageReady() {
        updateAutoViewStatus('等待页面加载...', 'info');

        // 先等待AJAX完成
        await waitForAjaxComplete();
        console.log('[自动查看页面] AJAX完成，开始监控DOM稳定性...');

        // 再等待DOM稳定
        updateAutoViewStatus('等待DOM稳定...', 'info');
        await waitForDomStable(10000, 1000); // 超时10秒，稳定时间1秒

        updateAutoViewStatus('页面已稳定，准备扫描...', 'info');
        console.log('[自动查看页面] 页面完全就绪！');
    }

    // 开始自动查看页面
    function startAutoViewPages() {
        if (isAutoViewing) {
            // 如果正在执行，则停止
            stopAutoViewing();
            clearViewState();
            updateAutoViewStatus('已手动停止', 'warning');
            return;
        }

        isAutoViewing = true;
        $('#auto-view-pages-btn').text('⏸️ 停止查看').css('background', 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)');
        updateAutoViewStatus('正在扫描未完成的页面...', 'info');

        // 扫描所有未完成的"查看页面"任务
        const pageElements = scanAndGetClickableElements();

        if (pageElements.length === 0) {
            updateAutoViewStatus('没有找到需要查看的页面！', 'warning');
            stopAutoViewing();
            return;
        }

        // 保存返回URL到 localStorage
        const returnUrl = window.location.href;
        localStorage.setItem(RETURN_URL_KEY, returnUrl);

        saveViewState({
            isActive: true,
            processedCount: 0,
            returnUrl: returnUrl
        });

        updateAutoViewStatus(`找到 ${pageElements.length} 个需要查看的页面，开始自动查看...`, 'success');

        // 开始处理第一个页面
        setTimeout(() => {
            processNextPageWithState();
        }, 500);
    }


    // 使用状态管理的处理逻辑（重新扫描并点击第一个）
    async function processNextPageWithState() {
        const state = getViewState();
        if (!state || !state.isActive) {
            console.log('[自动查看页面] 没有活动的查看任务');
            return;
        }

        // 等待页面完全加载
        await waitForPageReady();

        // 重新扫描当前页面的未完成任务
        console.log('[自动查看页面] 重新扫描页面...');
        const currentPageList = scanAndGetClickableElements();

        if (currentPageList.length === 0) {
            // 没有找到未完成的页面，说明全部完成
            updateAutoViewStatus('✅ 所有页面已查看完成！', 'success');
            clearViewState();
            stopAutoViewing();
            return;
        }

        // 记录已处理数量
        const processedCount = state.processedCount || 0;
        updateAutoViewStatus(`正在查看第 ${processedCount + 1} 个: ${currentPageList[0].title}`, 'info');

        // 点击第一个未完成的页面
        console.log('[自动查看页面] 点击:', currentPageList[0].title);
        currentPageList[0].element.click();

        // 更新状态：增加已处理计数
        saveViewState({
            isActive: true,
            processedCount: processedCount + 1,
            returnUrl: state.returnUrl
        });

        console.log('[自动查看页面] 等待页面跳转...');
    }

    // 扫描并返回可点击的元素（不使用ID标记）
    function scanAndGetClickableElements() {
        const result = [];

        // 查找所有活动元素
        const activities = document.querySelectorAll('.learning-activity, .activity-summary');

        activities.forEach((activity, index) => {
            // 检查完成状态
            const completenessBar = activity.querySelector('.completeness');
            if (!completenessBar) return;

            // 判断是否未完成（class包含 'none' 表示未完成）
            const isNotComplete = completenessBar.classList.contains('none');
            if (!isNotComplete) return;

            // 查找提示信息，判断是否是"查看页面"类型
            const tooltipInner = activity.querySelector('.ivu-tooltip-inner');
            if (!tooltipInner) return;

            const tooltipText = tooltipInner.textContent || tooltipInner.innerText;
            if (tooltipText.includes('查看页面')) {
                // 获取活动标题
                const titleEl = activity.querySelector('.activity-title .title, .title');
                const title = titleEl ? titleEl.textContent.trim() : '未知页面';

                // 获取可点击区域
                let clickableArea = activity.querySelector('.clickable-area');
                if (!clickableArea) {
                    clickableArea = activity.closest('.clickable-area');
                }
                if (!clickableArea && activity.classList.contains('clickable-area')) {
                    clickableArea = activity;
                }

                if (clickableArea) {
                    result.push({
                        element: clickableArea,
                        title: title,
                        index: index
                    });
                }
            }
        });

        console.log('[自动查看页面] 当前扫描到未完成页面:', result.length);
        return result;
    }

    // 停止自动查看
    function stopAutoViewing() {
        isAutoViewing = false;
        $('#auto-view-pages-btn')
            .text('👀 一键查看所有页面')
            .css('background', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
    }

    // ==================== 页面加载时检查是否需要恢复执行 ====================
    function checkAndResumeAutoView() {
        const state = getViewState();
        const returnUrl = localStorage.getItem(RETURN_URL_KEY);

        if (!state || !state.isActive) {
            return;
        }

        console.log('[自动查看页面] 检测到活动状态，当前URL:', window.location.href);
        console.log('[自动查看页面] 返回URL:', returnUrl);

        // 检查当前URL是否是返回URL
        if (returnUrl && window.location.href === returnUrl) {
            console.log('[自动查看页面] 检测到返回目标页面，继续执行...');

            // 恢复执行状态
            isAutoViewing = true;
            $('#auto-view-pages-btn').text('⏸️ 停止查看').css('background', 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)');

            updateAutoViewStatus(`继续自动查看 (已处理 ${state.processedCount || 0} 个)...`, 'info');

            // 等待一小段时间后开始处理（让页面初始化）
            setTimeout(() => {
                processNextPageWithState();
            }, 500);
        } else {
            // 如果不在返回页面，说明在查看页面中，等待页面稳定后返回
            console.log('[自动查看页面] 当前在查看页面中，等待页面稳定...');
            console.log('[自动查看页面] 将跳转到:', returnUrl);

            // 等待查看页面稳定（确保内容加载完成）
            updateAutoViewStatus('查看页面中...', 'info');

            // 使用async立即执行函数
            (async () => {
                await waitForPageReady();
                console.log('[自动查看页面] 查看页面已稳定，准备返回...');

                // 额外等待1秒确保被标记为已查看
                setTimeout(() => {
                    console.log('[自动查看页面] 跳转回课程页面');
                    window.location.href = returnUrl;
                }, 1000);
            })();
        }
    }

    // ==================== 新增：一键全部挂机功能 ====================
    let isAutoHanging = false;
    let hangQueue = [];
    let currentHangIndex = 0;

    // 更新挂机状态
    function updateAutoHangStatus(message, type = 'info') {
        const statusEl = $('#auto-hang-status');
        statusEl.show()
            .text(message)
            .removeClass('download-status-info download-status-success download-status-warning')
            .addClass(`download-status-${type}`);
        console.log(`[一键挂机] ${message}`);
    }

    // 开始一键全部挂机
    function startAutoHangAll() {
        if (isAutoHanging) {
            // 如果正在执行，则停止
            stopAutoHanging();
            updateAutoHangStatus('已手动停止', 'warning');
            return;
        }

        isAutoHanging = true;
        $('#auto-hang-all-btn').text('⏸️ 停止挂机').css('background', 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)');
        updateAutoHangStatus('正在扫描未完成的视频...', 'info');

        // 扫描所有未完成的挂机按钮
        hangQueue = scanHangButtons();

        if (hangQueue.length === 0) {
            updateAutoHangStatus('没有找到需要挂机的视频！', 'warning');
            stopAutoHanging();
            return;
        }

        updateAutoHangStatus(`找到 ${hangQueue.length} 个视频需要挂机，开始自动挂机...`, 'success');
        currentHangIndex = 0;

        // 开始处理队列
        processNextHang();
    }

    // 扫描所有挂机按钮
    function scanHangButtons() {
        const buttons = [];
        const allButtons = document.querySelectorAll('#auto-button, .auto-button');

        allButtons.forEach((button) => {
            const buttonText = button.textContent.trim();
            // 只挂机那些显示"点击挂机"的按钮（不包括"已完成"）
            if (buttonText === '点击挂机') {
                const activityId = button.dataset.activityId;
                const time = button.dataset.time;

                if (activityId && time) {
                    // 获取活动标题
                    const activityElement = button.closest('.learning-activity, .activity-summary');
                    let title = '未知视频';
                    if (activityElement) {
                        const titleEl = activityElement.querySelector('.activity-title .title, .title');
                        if (titleEl) {
                            title = titleEl.textContent.trim();
                        }
                    }

                    buttons.push({
                        button: button,
                        activityId: activityId,
                        time: time,
                        title: title
                    });
                }
            }
        });

        console.log('[一键挂机] 扫描结果:', buttons);
        return buttons;
    }

    // 处理下一个挂机任务
    function processNextHang() {
        if (!isAutoHanging) {
            updateAutoHangStatus('已停止', 'warning');
            return;
        }

        if (currentHangIndex >= hangQueue.length) {
            // 全部处理完成
            updateAutoHangStatus('✅ 所有视频已挂机完成！', 'success');
            stopAutoHanging();
            return;
        }

        const hangInfo = hangQueue[currentHangIndex];
        const interval = parseInt($('#auto-hang-interval').val()) || 30;

        updateAutoHangStatus(`正在挂机 (${currentHangIndex + 1}/${hangQueue.length}): ${hangInfo.title}`, 'info');
        console.log('[一键挂机] 挂机:', hangInfo.title, '时长:', hangInfo.time);

        // 调用挂机API
        requestActivitiesRead(hangInfo.activityId, hangInfo.time, $(hangInfo.button));

        // 等待间隔后处理下一个
        currentHangIndex++;
        updateAutoHangStatus(`挂机成功，等待 ${interval} 秒后继续...`, 'success');

        setTimeout(() => {
            processNextHang();
        }, interval * 1000);
    }

    // 停止挂机
    function stopAutoHanging() {
        isAutoHanging = false;
        $('#auto-hang-all-btn')
            .text('🎬 一键全部挂机')
            .css('background', 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)');
    }

    // ==================== 初始化下载面板 ====================
    setTimeout(function() {
        createDownloadPanel();
        console.log('[资源下载] 下载面板已加载');

        // 检查是否需要恢复自动查看任务
        setTimeout(() => {
            checkAndResumeAutoView();
        }, 500);
    }, 1000);

    // ==================== 原有功能：挂机脚本 ====================
    $(document).on('click', '#auto-button', function () {
        var $this = $(this);
        requestActivitiesRead(this.dataset.activityId,this.dataset.time,$this)
    });
    setInterval(function (){
        const activity = document.getElementsByClassName("learning-activity ng-scope")
        for (const element of activity) {
            let autoButton = element.getElementsByClassName("auto-button");
            if (autoButton && autoButton.length>0) {
                continue
            }
            let id =  extractNumber(element.id)
            let activityValue = element.getElementsByClassName("attribute-value number ng-binding")
            if (activityValue.length>0) {
                let completeness = element.getElementsByClassName("completeness full");
                let activityTimeStr = activityValue[0].textContent
                let time = timeStringToSeconds(activityTimeStr);
                let buttonText = completeness && completeness.length>0?"已完成":"点击挂机"
                let btnHtml = '<span id="auto-button" class="button button-green small gtm-label auto-button" style="font-size: 12px; width: 58px; margin-left: 4px;" data-activity-id="'+id+'" data-time="'+time+'">'+buttonText+'</span>';
                $(element).prepend(btnHtml)
                console.log("课程id:",id,"时间:",time);
            }
        }
    },500)
    function requestActivitiesRead(id,end,$this){
        $.ajax({
            type: "POST",
            url: "https://lms.ouchn.cn/api/course/activities-read/"+id,
            contentType: 'application/json',
            data: JSON.stringify({
                start: 0,
                end: parseInt(end),
            }),
            success: function (response) {
                console.log('响应结果',response);
                if (response.completeness=="full"){
                    $this.text('已完成');
                }
            }
        });
    }

    function timeStringToSeconds(timeString) {
        // 按冒号分割字符串
        var parts = timeString.split(':');

        // 将每个部分转换为整数
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        var seconds = parseInt(parts[2], 10);

        // 计算总秒数
        var totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

        return totalSeconds;
    }

    function extractNumber(str) {
        // 找到最后一个连字符的位置
        var lastDashIndex = str.lastIndexOf('-');
        // 提取该位置之后的子字符串
        return str.substring(lastDashIndex + 1);
    }
})();

