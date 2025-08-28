document.addEventListener('DOMContentLoaded', () => {
    // === Elemen UI ===
    const loadingOverlay = document.getElementById('loading-overlay');
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const notificationContainer = document.getElementById('notification-container');
    const keyListContainer = document.getElementById('api-key-list-container');
    const manageProjectsBtn = document.getElementById('manage-projects-btn');
    const projectModal = document.getElementById('project-modal');
    const modalCloseBtn = projectModal.querySelector('.modal-close');
    const modalBody = document.getElementById('modal-body');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmTitle = document.getElementById('confirmation-modal-title');
    const confirmMessage = document.getElementById('confirmation-modal-message');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');
    const apiKeySuccessModal = document.getElementById('apikey-success-modal');
    const apiKeyDetailsContainer = document.getElementById('apikey-details-container');
    const apiKeySuccessOkBtn = document.getElementById('apikey-success-ok-btn');
    const apiKeyCopyBtn = document.getElementById('apikey-copy-btn');
    const manageDomainsBtn = document.getElementById('manage-domains-btn');
    const cloudflareModal = document.getElementById('cloudflare-modal');
    const cloudflareModalTitle = document.getElementById('cloudflare-modal-title');
    const cloudflareModalBody = document.getElementById('cloudflare-modal-body');
    const cfSuccessModal = document.getElementById('cf-success-modal');
    const cfSuccessMessage = document.getElementById('cf-success-message');
    const cfNameserverList = document.getElementById('cf-nameserver-list');
    const cfSuccessOkBtn = document.getElementById('cf-success-ok-btn');
    
    let apiKeyTextToCopy = '';

    // === Fungsi Bantuan & Logika Umum ===

    // FUNGSI BARU: Untuk memformat tanggal dan jam secara konsisten
    const formatFullDate = (isoString) => new Date(isoString).toLocaleString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    let notificationTimeout;
    const showNotification = (message, type = 'success') => {
        clearTimeout(notificationTimeout);
        notificationContainer.innerHTML = '';
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        notificationContainer.appendChild(notif);
        notificationTimeout = setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    };

    const openModal = (modal) => modal.style.display = 'flex';
    const closeModal = (modal) => modal.style.display = 'none';
    modalCloseBtn.addEventListener('click', () => closeModal(projectModal));
    projectModal.addEventListener('click', (e) => { if (e.target === projectModal) closeModal(projectModal); });
    cloudflareModal.querySelector('.modal-close').addEventListener('click', () => closeModal(cloudflareModal));
    
    const showConfirmation = (title, message) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        openModal(confirmationModal);
        return new Promise((resolve) => {
            confirmBtnYes.onclick = () => { closeModal(confirmationModal); resolve(true); };
            confirmBtnNo.onclick = () => { closeModal(confirmationModal); resolve(false); };
        });
    };

    const showApiKeySuccessPopup = (newKey) => {
        const expiryText = newKey.expires_at === 'permanent' ? 'Permanen' : formatFullDate(newKey.expires_at);
        
        apiKeyDetailsContainer.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">Kunci API</span>
                <span class="detail-value">${newKey.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Dibuat</span>
                <span class="detail-value">${formatFullDate(newKey.created_at)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Kadaluwarsa</span>
                <span class="detail-value">${expiryText}</span>
            </div>`;
        const notes = "Harap simpan detail kunci ini dengan baik. Informasi ini bersifat rahasia dan tidak akan ditampilkan lagi demi keamanan Anda.";
        apiKeyTextToCopy = `Ini adalah data apikey anda
-------------------
Apikey: ${newKey.name}
Tanggal buat: ${formatFullDate(newKey.created_at)}
Tanggal kadaluarsa: ${expiryText}
-------------------
Notes:
${notes}`;
        openModal(apiKeySuccessModal);
    };

    // === Logika API ===
    const callApi = async (action, data = {}) => {
        const password = localStorage.getItem('adminPassword'); 
        if (!password) throw new Error('Sesi admin tidak valid');
        const response = await fetch('/api/create-website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data, adminPassword: password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
    };

    // === Fungsi Render Tampilan ===
    const renderApiKeys = (keys) => {
        keyListContainer.innerHTML = '';
        if (Object.keys(keys).length === 0) { keyListContainer.innerHTML = '<p>Belum ada API Key yang dibuat.</p>'; return; }
        for (const key in keys) {
            const keyData = keys[key];
            // DIUBAH: Menggunakan formatFullDate untuk menampilkan jam
            const expiry = keyData.expires_at === 'permanent' ? 'Permanen' : `Kadaluwarsa: ${formatFullDate(keyData.expires_at)}`;
            const item = document.createElement('div');
            item.className = 'key-item';
            item.innerHTML = `<div class="key-info"><span class="key-name">${key}</span><span class="key-expiry">${expiry}</span></div><button class="delete-btn" data-key="${key}"><i class="fas fa-trash-alt"></i></button>`;
            keyListContainer.appendChild(item);
        }
    };

    const renderProjects = (projects) => {
        modalBody.innerHTML = '';
        if (projects.length === 0) { modalBody.innerHTML = '<p>Tidak ada proyek/repositori yang ditemukan.</p>'; return; }
        let projectHtml = '';
        projects.forEach(proj => {
            const githubButton = proj.hasGithub ? `<button class="delete-btn delete-repo-btn" data-name="${proj.name}">Hapus Repo</button>` : '';
            const vercelButton = proj.hasVercel ? `<button class="delete-btn delete-vercel-btn" data-name="${proj.name}">Hapus Vercel</button>` : '';
            const repoInfo = proj.hasGithub ? `<a href="${proj.githubUrl}" target="_blank">${proj.name}</a><span>${proj.isPrivate ? 'Private' : 'Public'}</span>` : `<strong>${proj.name}</strong><span>(Hanya ada di Vercel)</span>`;
            projectHtml += `<div class="repo-item"><div class="item-info">${repoInfo}</div><div class="repo-actions">${githubButton}${vercelButton}</div></div>`;
        });
        modalBody.innerHTML = `<ul class="list-item-container">${projectHtml}</ul>`;
    };
    
    // === Logika Cloudflare ===
    const showCloudflareSuccessPopup = (data) => {
        cfSuccessMessage.innerHTML = `Domain <strong>${data.domain}</strong> berhasil ditambahkan ke akun Cloudflare Anda.`;
        cfNameserverList.innerHTML = data.nameservers.map(ns => `<li class="nameserver-item"><span>${ns}</span><button class="copy-ns-btn" data-ns="${ns}">Copy</button></li>`).join('');
        openModal(cfSuccessModal);
    };

    const setupBulkDeleteControls = (container, listType, context) => {
        const selectAllCheckbox = container.querySelector('.select-all-checkbox');
        const checkboxes = container.querySelectorAll('.item-checkbox');
        const bulkDeleteBtn = container.querySelector('.bulk-delete-btn');
        const updateButtonVisibility = () => {
            const checkedCount = container.querySelectorAll('.item-checkbox:checked').length;
            bulkDeleteBtn.style.display = checkedCount > 0 ? 'inline-flex' : 'none';
            bulkDeleteBtn.textContent = `Hapus ${checkedCount} Item Terpilih`;
        };
        if(selectAllCheckbox) selectAllCheckbox.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateButtonVisibility();
        });
        checkboxes.forEach(cb => cb.addEventListener('change', () => {
            if(selectAllCheckbox) selectAllCheckbox.checked = [...checkboxes].every(c => c.checked);
            updateButtonVisibility();
        }));
        if(bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', async () => {
            const selectedItems = [...checkboxes].filter(cb => cb.checked);
            const selectedIds = selectedItems.map(cb => cb.value);
            const selectedNames = selectedItems.map(cb => cb.dataset.name);
            let confirmed = false;
            if (listType === 'zones') {
                const confirmationMessage = `Anda akan MENGHAPUS PERMANEN ${selectedIds.length} zona berikut:\n\n${selectedNames.join('\n')}\n\nLanjutkan?`;
                confirmed = await showConfirmation('KONFIRMASI HAPUS ZONA', confirmationMessage);
            } else {
                confirmed = await showConfirmation('Hapus Record DNS?', `Anda yakin ingin menghapus ${selectedIds.length} record DNS terpilih?`);
            }
            if (confirmed) {
                bulkDeleteBtn.textContent = 'Menghapus...'; bulkDeleteBtn.disabled = true;
                try {
                    let result;
                    if (listType === 'zones') {
                        result = await callApi('bulkDeleteCloudflareZones', { zoneIds: selectedIds });
                    } else { // dns
                        result = await callApi('bulkDeleteDnsRecords', { zoneId: context.zoneId, recordIds: selectedIds });
                    }
                    showNotification(result.message, 'success');
                    if (listType === 'zones') manageDomainsBtn.click();
                    else showDnsRecordsView(context.zoneId, context.zoneName);
                } catch (error) {
                    showNotification(error.message, 'error');
                } finally {
                     bulkDeleteBtn.disabled = false;
                     updateButtonVisibility();
                }
            }
        });
    };

    const renderCloudflareZones = (zones) => {
        cloudflareModalTitle.textContent = 'Manajemen Zona Cloudflare';
        let listHtml = zones.map(zone => `
            <li class="list-item" data-search-term="${zone.name.toLowerCase()}">
                <input type="checkbox" class="item-checkbox" value="${zone.id}" data-name="${zone.name}">
                <div class="item-info">
                    <strong>${zone.name}</strong>
                    <span>Status: ${zone.status}</span>
                </div>
                <button class="manage-dns-btn" data-zone-id="${zone.id}" data-zone-name="${zone.name}">Kelola DNS</button>
            </li>`).join('');

        cloudflareModalBody.innerHTML = `
            <div class="list-toolbar">
                <form id="add-domain-form" class="add-domain-form">
                    <input type="text" id="new-domain-name" placeholder="Masukkan domain baru..." required>
                    <button type="submit">Tambah</button>
                </form>
            </div>
            <div class="list-toolbar">
                <input type="checkbox" class="select-all-checkbox" title="Pilih Semua">
                <form class="search-form" style="margin-left: 10px;"><input type="search" id="zone-search-input" placeholder="Cari domain..."></form>
                <button class="bulk-delete-btn">Hapus Terpilih</button>
            </div>
            <ul class="list-item-container">${zones.length > 0 ? listHtml : '<li>Tidak ada zona ditemukan.</li>'}</ul>`;
        setupBulkDeleteControls(cloudflareModalBody, 'zones');
    };

    const renderDnsRecords = (records, zoneId, zoneName) => {
        cloudflareModalTitle.textContent = `Record DNS untuk ${zoneName}`;
        let listHtml = records.map(rec => {
            const searchTerm = `${rec.name} ${rec.type} ${rec.content}`.toLowerCase();
            return `<li class="list-item" data-search-term="${searchTerm}">
                <input type="checkbox" class="item-checkbox" value="${rec.id}" data-name="${rec.name}">
                <div class="item-info">
                    <strong>${rec.name}</strong>
                    <span>${rec.type} &rarr; ${rec.content}</span>
                </div>
            </li>`;
        }).join('');
        
        cloudflareModalBody.innerHTML = `
            <div class="list-toolbar">
                 <button id="cloudflare-modal-back-btn">&larr; Kembali</button>
                 <input type="checkbox" class="select-all-checkbox" title="Pilih Semua">
                 <form class="search-form" style="margin-left: 10px;"><input type="search" id="dns-search-input" placeholder="Cari record..."></form>
                 <button class="bulk-delete-btn">Hapus Terpilih</button>
            </div>
            <ul class="list-item-container">${records.length > 0 ? listHtml : '<li>Tidak ada record DNS.</li>'}</ul>`;
        cloudflareModalBody.querySelector('#cloudflare-modal-back-btn').onclick = () => manageDomainsBtn.click();
        setupBulkDeleteControls(cloudflareModalBody, 'dns', { zoneId, zoneName });
    };

    const showDnsRecordsView = async (zoneId, zoneName) => {
        cloudflareModalBody.innerHTML = `<p>Memuat record DNS untuk ${zoneName}...</p>`;
        try {
            const records = await callApi('listDnsRecords', { zoneId });
            renderDnsRecords(records, zoneId, zoneName);
        } catch (error) {
            showNotification(error.message, 'error');
            manageDomainsBtn.click();
        }
    };
    
    // === Fungsi Utama & Event Listener ===
    const showAdminPanel = (keys) => {
        loginScreen.style.display = 'none';
        adminPanel.style.display = 'block';
        renderApiKeys(keys);
    };

    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) return showNotification('Password tidak boleh kosong.', 'error');
        localStorage.setItem('adminPassword', password); 
        loginBtn.textContent = 'Memverifikasi...'; loginBtn.disabled = true;
        try {
            const keys = await callApi('getApiKeys');
            showAdminPanel(keys);
            showNotification('Login berhasil!', 'success');
        } catch (error) {
            showNotification(`Login Gagal: ${error.message}`, 'error');
            localStorage.removeItem('adminPassword'); 
        } finally {
            loginBtn.textContent = 'Masuk'; loginBtn.disabled = false;
        }
    });

    const tryAutoLogin = async () => {
        try {
            if (localStorage.getItem('adminPassword')) {
                const keys = await callApi('getApiKeys');
                showAdminPanel(keys);
                showNotification('Login berhasil!', 'success');
            } else {
                loginScreen.style.display = 'block';
            }
        } catch (error) {
            localStorage.removeItem('adminPassword');
            loginScreen.style.display = 'block';
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    };

    document.getElementById('create-key-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const createBtn = e.target.querySelector('button[type="submit"]');
        createBtn.textContent = 'Membuat...'; createBtn.disabled = true;
        const data = {
            key: document.getElementById('new-apikey-name').value.trim(),
            duration: document.getElementById('new-apikey-duration').value,
            unit: document.getElementById('new-apikey-unit').value,
            isPermanent: document.getElementById('permanent-key').checked
        };
        try {
            const result = await callApi('createApiKey', data);
            showApiKeySuccessPopup(result.newKey);
            document.getElementById('new-apikey-name').value = '';
            document.getElementById('permanent-key').checked = false;
            document.getElementById('duration-section').style.display = 'block';
        } catch (error) {
            showNotification(`Gagal: ${error.message}`, 'error');
        } finally {
            createBtn.textContent = 'Buat Kunci'; createBtn.disabled = false;
        }
    });

    apiKeySuccessOkBtn.addEventListener('click', async () => {
        closeModal(apiKeySuccessModal);
        try {
            const newKeys = await callApi('getApiKeys');
            renderApiKeys(newKeys);
        } catch (error) {
            showNotification('Gagal memuat ulang daftar kunci.', 'error');
        }
    });
    
    apiKeyCopyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(apiKeyTextToCopy).then(() => {
            apiKeyCopyBtn.innerHTML = '<i class="fas fa-check"></i> Tersalin!';
            setTimeout(() => {
                apiKeyCopyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        }).catch(err => {
            console.error('Gagal menyalin teks: ', err);
            showNotification('Gagal menyalin.', 'error');
        });
    });

    manageProjectsBtn.addEventListener('click', async () => {
        modalBody.innerHTML = '<p>Memuat proyek...</p>';
        openModal(projectModal);
        try {
            const projects = await callApi('listProjects');
            renderProjects(projects);
        } catch (error) {
            showNotification(error.message, 'error');
            modalBody.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    });

    modalBody.addEventListener('click', async (e) => {
        const targetButton = e.target.closest('button.delete-btn');
        if (!targetButton) return;
        const repoName = targetButton.dataset.name;
        let action, title, message, originalText;
        if (targetButton.classList.contains('delete-repo-btn')) {
            action = 'deleteRepo'; title = 'Hapus Repositori GitHub?';
            message = `Tindakan ini akan menghapus permanen repositori '${repoName}' di GitHub.`;
            originalText = 'Hapus Repo';
        } else if (targetButton.classList.contains('delete-vercel-btn')) {
            action = 'deleteVercelProject'; title = 'Hapus Proyek Vercel?';
            message = `Ini akan menghapus proyek '${repoName}' dari Vercel, termasuk semua deployment.`;
            originalText = 'Hapus Vercel';
        } else { return; }
        const confirmed = await showConfirmation(title, message);
        if (confirmed) {
            targetButton.textContent = 'Menghapus...'; targetButton.disabled = true;
            try {
                const result = await callApi(action, { repoName: repoName, projectName: repoName });
                showNotification(result.message, 'success');
                const actionsContainer = targetButton.parentElement;
                targetButton.remove();
                if (actionsContainer.children.length === 0) {
                    const repoItem = actionsContainer.parentElement;
                    repoItem.style.opacity = '0';
                    setTimeout(() => repoItem.remove(), 300);
                }
            } catch (error) {
                showNotification(error.message, 'error');
                targetButton.textContent = originalText; targetButton.disabled = false;
            }
        }
    });
    
    manageDomainsBtn.addEventListener('click', async () => {
        cloudflareModalBody.innerHTML = '<p>Memuat zona dari Cloudflare...</p>';
        openModal(cloudflareModal);
        try {
            const zones = await callApi('listAllCloudflareZones');
            renderCloudflareZones(zones);
        } catch (error) {
            showNotification(error.message, 'error');
            cloudflareModalBody.innerHTML = `<p style="color: var(--error-color);">Gagal memuat. Pastikan CLOUDFLARE_API_TOKEN sudah benar.</p>`;
        }
    });
    
    cfSuccessOkBtn.addEventListener('click', () => {
        closeModal(cfSuccessModal);
        manageDomainsBtn.click();
    });

    cfNameserverList.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-ns-btn')) {
            const ns = e.target.dataset.ns;
            navigator.clipboard.writeText(ns).then(() => {
                e.target.textContent = 'Tersalin!';
                setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
            });
        }
    });

    cloudflareModalBody.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('#zone-search-input, #dns-search-input')) {
            const searchTerm = target.value.toLowerCase();
            const listContainer = target.closest('#cloudflare-modal-body').querySelector('.list-item-container');
            const items = listContainer.querySelectorAll('.list-item');
            items.forEach(item => {
                const itemSearchTerm = item.dataset.searchTerm || '';
                item.style.display = itemSearchTerm.includes(searchTerm) ? 'flex' : 'none';
            });
        }
    });

    cloudflareModalBody.addEventListener('submit', (e) => {
        if (e.target.matches('.search-form, #add-domain-form')) e.preventDefault();
    });

    cloudflareModalBody.addEventListener('click', async (e) => {
        if (e.target.closest('#add-domain-form button')) {
            e.preventDefault();
            const form = e.target.closest('#add-domain-form');
            const input = form.querySelector('#new-domain-name');
            const button = form.querySelector('button');
            const domainName = input.value.trim();
            if (!domainName) return showNotification('Nama domain tidak boleh kosong.', 'error');
            button.textContent = 'Menambahkan...'; button.disabled = true;
            try {
                const result = await callApi('addCloudflareZone', { domainName });
                closeModal(cloudflareModal);
                showCloudflareSuccessPopup(result);
                input.value = '';
            } catch (error) { showNotification(error.message, 'error');
            } finally { button.textContent = 'Tambah'; button.disabled = false; }
        }
        if (e.target.classList.contains('manage-dns-btn')) {
            showDnsRecordsView(e.target.dataset.zoneId, e.target.dataset.zoneName);
        }
    });

    keyListContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.delete-btn');
        if (button) {
            const key = button.dataset.key;
            const confirmed = await showConfirmation('Hapus Kunci API?', `Anda yakin ingin menghapus kunci "${key}"?`);
            if (confirmed) {
                try {
                    const result = await callApi('deleteApiKey', { key });
                    showNotification(result.message, 'success');
                    const newKeys = await callApi('getApiKeys');
                    renderApiKeys(newKeys);
                } catch (error) {
                    showNotification(`Gagal: ${error.message}`, 'error');
                }
            }
        }
    });

    document.getElementById('permanent-key').addEventListener('change', (e) => {
        document.getElementById('duration-section').style.display = e.target.checked ? 'none' : 'block';
    });

    // === Inisialisasi Aplikasi ===
    const init = () => {
        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; } 
        else { body.classList.remove('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }
        themeToggle.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('theme_preference_v1', newTheme);
            if (newTheme === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; }
            else { body.classList.remove('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }
        });
        setTimeout(tryAutoLogin, 700);
    };
    
    init();
});