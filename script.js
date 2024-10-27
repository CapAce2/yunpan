let token = '92d565a0b0985b10317dd25d8f37965e';  // 云盘功能的令牌
const owner = 'maoziace'; // 确保这是正确的 Gitee 用户名
const cloudRepo = 'maozi-cloud-drive'; // 云盘仓库名

function jsonp(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        const script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function logError(message, error) {
    console.error(message, error);
    if (error.response) {
        console.error('错误状态码:', error.response.status);
        console.error('错误数据:', error.response.data);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof axios === 'undefined') {
        alert('Axios 库未正确载，络页面。');
        return;
    }

    const networkStatus = await checkNetworkConnection();
    if (!networkStatus) {
        console.warn('无法连接到 Gitee。某些功能可能无法正常工作。');
    }

    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const fileList = document.getElementById('files');
    const selectedFilesDiv = document.getElementById('selected-files');
    const selectAllCheckbox = document.getElementById('select-all-files');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');

    fileInput.addEventListener('change', () => {
        selectedFilesDiv.innerHTML = '';
        Array.from(fileInput.files).forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.textContent = `${file.name} (${formatFileSize(file.size)})`;
            selectedFilesDiv.appendChild(fileItem);
        });
    });

    uploadBtn.addEventListener('click', async () => {
        const files = fileInput.files;
        if (files.length === 0) {
            alert('请选择要上传的文件');
            return;
        }

        for (let file of files) {
            try {
                await uploadFile(file);
            } catch (error) {
                console.error('上传文件时发生错误:', error);
                showNotification(`上传 ${file.name} 失败: ${error.message}`, 'error');
            }
        }

        fileInput.value = '';
        document.getElementById('selected-files').innerHTML = '';
    });

    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('#files input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
        updateBatchDeleteButton();
    });

    batchDeleteBtn.addEventListener('click', () => {
        const selectedFiles = document.querySelectorAll('#files input[type="checkbox"]:checked');
        if (selectedFiles.length === 0) {
            showNotification('请选择要删除的文件', 'warning');
            return;
        }
        showConfirmModal(`确定要删除选中的 ${selectedFiles.length} 个文件吗？`, () => {
            batchDeleteFiles(selectedFiles);
        });
    });

    function updateBatchDeleteButton() {
        const selectedFiles = document.querySelectorAll('#files input[type="checkbox"]:checked');
        batchDeleteBtn.style.display = selectedFiles.length > 0 ? 'inline-block' : 'none';
    }

    async function batchDeleteFiles(selectedFiles) {
        for (const checkbox of selectedFiles) {
            const fileName = checkbox.dataset.filename;
            const fileSha = checkbox.dataset.sha;
            try {
                await deleteFile(fileName, fileSha, false);
            } catch (error) {
                console.error(`删除文件 ${fileName} 失败:`, error);
                showNotification(`删除 ${fileName} 失败: ${error.message}`, 'error');
            }
        }
        loadFiles();
        showNotification('批量删除完成', 'info');
    }

    // 页面加载时自验证
    await verifyToken();

    async function verifyToken() {
        try {
            const userResponse = await axios.get('https://gitee.com/api/v5/user', {
                params: { access_token: token }
            });
            console.log('认证成功:', userResponse.data);

            // 检查云盘仓库是否存在
            try {
                await axios.get(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}`, {
                    params: { access_token: token }
                });
                console.log('云盘仓库存在！');
                loadFiles();
            } catch (repoError) {
                console.error('云盘仓库检查失败:', repoError);
                if (repoError.response) {
                    console.error('错误状态码:', repoError.response.status);
                    console.error('错误数据:', repoError.response.data);
                }
                showNotification('云盘仓库不存在或无权访问。请检查仓库名称和权限设置。', 'warning');
            }
        } catch (error) {
            console.error('认证失败:', error);
            if (error.response) {
                console.error('错误状态码:', error.response.status);
                console.error('错误数据:', error.response.data);
            }
            showNotification(`认证失败，错误: ${error.response ? error.response.data.message : error.message}`, 'error');
        }
    }

    async function loadFiles() {
        try {
            const response = await axios.get(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents`, {
                params: { 
                    access_token: token,
                    ref: 'master'
                }
            });
            console.log('API response:', response.data);
            fileList.innerHTML = '';
            if (response.data.length === 0) {
                fileList.innerHTML = '<li>云盘为空</li>';
            } else {
                response.data.forEach(file => {
                    if (file.type === 'file') {
                        console.log('File details:', file);
                        const li = document.createElement('li');
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.dataset.filename = file.name;
                        checkbox.dataset.sha = file.sha;
                        checkbox.addEventListener('change', updateBatchDeleteButton);
                        
                        const fileInfo = document.createElement('div');
                        fileInfo.className = 'file-info';
                        fileInfo.textContent = file.name;
                        
                        const buttonContainer = document.createElement('div');
                        buttonContainer.className = 'button-container';
                        
                        const downloadBtn = document.createElement('button');
                        downloadBtn.textContent = '下载';
                        downloadBtn.className = 'download-btn';
                        downloadBtn.onclick = () => downloadFileWithRetry(file.name, file.path);
                        
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = '删除';
                        deleteBtn.className = 'delete-btn';
                        deleteBtn.onclick = () => deleteFile(file.name, file.sha);
                        
                        buttonContainer.appendChild(downloadBtn);
                        buttonContainer.appendChild(deleteBtn);
                        
                        li.appendChild(checkbox);
                        li.appendChild(fileInfo);
                        li.appendChild(buttonContainer);
                        fileList.appendChild(li);
                    }
                });
            }
            updateBatchDeleteButton();
        } catch (error) {
            logError('加载文件列表失败:', error);
            if (error.response && error.response.status === 404) {
                fileList.innerHTML = '<li>库为空或不存在</li>';
            } else {
                showNotification(`加载文件列表失败，错误: ${error.message}`, 'error');
            }
        }
    }

    function uploadFile(file) {
        return new Promise((resolve, reject) => {
            const progressBar = document.getElementById('upload-progress');
            const progressElement = progressBar.querySelector('.progress');

            progressBar.style.display = 'block';
            progressElement.style.width = '0%';
            progressElement.textContent = '0%';

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Content = e.target.result.split(',')[1];
                
                const data = {
                    access_token: token,
                    content: base64Content,
                    message: `Upload ${file.name}`,
                    branch: 'master'
                };

                try {
                    const response = await axios.post(
                        `https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents/${file.name}`,
                        data,
                        {
                            onUploadProgress: (progressEvent) => {
                                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                progressElement.style.width = percentCompleted + '%';
                                progressElement.textContent = percentCompleted + '%';
                            }
                        }
                    );

                    progressElement.style.width = '100%';
                    progressElement.textContent = '100%';
                    setTimeout(() => {
                        progressBar.style.display = 'none';
                    }, 1000);
                    showNotification(`${file.name} 上传成功！`, 'info');
                    loadFiles();
                    resolve();
                } catch (error) {
                    progressBar.style.display = 'none';
                    reject(error);
                }
            };

            reader.onerror = (error) => {
                reject(error);
            };

            reader.readAsDataURL(file);
        });
    }

    async function getFileSha(fileName) {
        try {
            const response = await axios.get(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents/${fileName}`, {
                params: { 
                    access_token: token,
                    ref: 'master'
                }
            });
            return response.data.sha;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null; // 文件不存在
            }
            throw error;
        }
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    async function downloadFileWithRetry(fileName, filePath, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                if (await checkNetworkConnection()) {
                    const response = await axios.get(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents/${filePath}`, {
                        params: { 
                            access_token: token,
                            ref: 'master'
                        },
                        responseType: 'json'
                    });

                    const base64Content = response.data.content.replace(/\s/g, '');
                    const binaryString = atob(base64Content);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    const blob = new Blob([bytes], { type: 'application/octet-stream' });
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                    return;
                } else {
                    throw new Error('网络连接失败');
                }
            } catch (error) {
                logError(`下载尝试 ${i + 1} 失败:`, error);
                if (i === retries - 1) {
                    showNotification(`下载 ${fileName} 失败，已尝试 ${retries} 次。错误: ${error.message}`, 'error');
                } else {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
    }

    function formatFileSize(size) {
        if (size < 1024) return size + ' B';
        if (size < 1048576) return (size / 1024).toFixed(2) + ' KB';
        if (size < 1073741824) return (size / 1048576).toFixed(2) + ' MB';
        return (size / 1073741824).toFixed(2) + ' GB';
    }

    async function checkNetworkConnection() {
        try {
            const response = await axios.get('https://gitee.com/api/v5/user', {
                params: { access_token: 'invalid_token' },
                timeout: 5000
            });
            console.log('网连接正常');
            return true;
        } catch (error) {
            if (error.response && error.response.status === 401) {
                // 401错误表示我们成功连接到了Gitee API，只是token无效
                console.log('网络连接正常，但token无效');
                return true;
            }
            console.error('网络连接失败:', error);
            showNotification('网络连接失败，请检查您的网络设', 'error');
            return false;
        }
    }

    function showConfirmModal(message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        const modalContent = modal.querySelector('.modal-content');
        const modalMessage = document.getElementById('modal-message');
        const confirmButton = document.getElementById('modal-confirm');
        const cancelButton = document.getElementById('modal-cancel');

        modalMessage.textContent = message;
        modal.style.display = 'block';
        
        // 触发重绘以启动过渡效果
        modal.offsetHeight;
        modal.classList.add('show');

        confirmButton.onclick = () => {
            closeModal();
            onConfirm();
        };

        cancelButton.onclick = closeModal;

        window.onclick = (event) => {
            if (event.target === modal) {
                closeModal();
            }
        };

        function closeModal() {
            modal.classList.remove('show');
            modal.addEventListener('transitionend', function handler() {
                modal.style.display = 'none';
                modal.removeEventListener('transitionend', handler);
            });
        }
    }

    async function deleteFile(fileName, fileSha, showConfirmation = true) {
        const deleteAction = async () => {
            try {
                const response = await axios.delete(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents/${fileName}`, {
                    params: { access_token: token },
                    data: {
                        message: `Delete ${fileName}`,
                        sha: fileSha,
                        branch: 'master'
                    }
                });
                showNotification(`${fileName} 删除成功！`, 'info');
                if (showConfirmation) {
                    loadFiles(); // 仅在单个删除时重新加载文件列表
                }
            } catch (error) {
                logError('删除文件失败:', error);
                throw error;
            }
        };

        if (showConfirmation) {
            showConfirmModal(`确定要删除文件 "${fileName}" 吗？`, deleteAction);
        } else {
            await deleteAction();
        }
    }

    // 新的辅助函数，用于高效地将 ArrayBuffer 转换为 Base64
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) {
            console.error('Notification container not found');
            alert(message);  // 如果找不到容器，就使用 alert 作为后备方案
            return;
        }
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        // 触发重绘以启动过渡效果
        notification.offsetHeight;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
            notification.addEventListener('transitionend', () => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            });
        }, 3000);
    }

    function updateSelectAllCheckbox() {
        const allCheckboxes = document.querySelectorAll('#files input[type="checkbox"]');
        const checkedCheckboxes = document.querySelectorAll('#files input[type="checkbox"]:checked');
        const selectAllCheckbox = document.getElementById('select-all-files');
        
        selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length;
        selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
    }

    function createFileListItem(file) {
        const li = document.createElement('li');
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.filename = file.name;
        checkbox.dataset.sha = file.sha;
        checkbox.addEventListener('change', () => {
            updateBatchDeleteButton();
            updateSelectAllCheckbox();
        });
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.textContent = file.name;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '下载';
        downloadBtn.className = 'download-btn';
        downloadBtn.onclick = () => downloadFileWithRetry(file.name, file.path);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteFile(file.name, file.sha);
        
        buttonContainer.appendChild(downloadBtn);
        buttonContainer.appendChild(deleteBtn);
        
        li.appendChild(checkbox);
        li.appendChild(fileInfo);
        li.appendChild(buttonContainer);
        return li;
    }

    async function loadFiles() {
        try {
            const response = await axios.get(`https://gitee.com/api/v5/repos/${owner}/${cloudRepo}/contents`, {
                params: { 
                    access_token: token,
                    ref: 'master'
                }
            });
            console.log('API response:', response.data);
            fileList.innerHTML = '';
            if (response.data.length === 0) {
                fileList.innerHTML = '<li>云盘为空</li>';
            } else {
                response.data.forEach(file => {
                    if (file.type === 'file') {
                        console.log('File details:', file);
                        const li = createFileListItem(file);
                        fileList.appendChild(li);
                    }
                });
            }
            updateBatchDeleteButton();
            updateSelectAllCheckbox();
        } catch (error) {
            logError('加载文件列表失败:', error);
            if (error.response && error.response.status === 404) {
                fileList.innerHTML = '<li>库为空或不存在</li>';
            } else {
                showNotification(`加载文件列表失败，错误: ${error.message}`, 'error');
            }
        }
    }
});

window.onerror = function(message, source, lineno, colno, error) {
    console.error('全局错误:', message, source, lineno, colno, error);
    showNotification(`发生了一个错误: ${message}`, 'error');
};
