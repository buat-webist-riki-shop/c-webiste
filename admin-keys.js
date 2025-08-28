document.addEventListener('DOMContentLoaded', () => {
    // === Elemen UI ===
    const loadingOverlay = document.getElementById('loading-overlay');
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const createKeyForm = document.getElementById('create-key-form');
    const keyListContainer = document.getElementById('api-key-list-container');
    const permanentCheckbox = document.getElementById('permanent-key');
    const durationSection = document.getElementById('duration-section');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const notificationContainer = document.getElementById('notification-container');
    const manageProjectsBtn = document.getElementById('manage-projects-btn');
    const projectModal = document.getElementById('project-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    // Elemen baru untuk modal konfirmasi
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmTitle = document.getElementById('confirmation-modal-title');
    const confirmMessage = document.getElementById('confirmation-modal-message');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');

    // === Logika Notifikasi Estetis ===
    const showNotification = (message, type = 'success') => {
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        notificationContainer.appendChild(notif);
        setTimeout(() => { notif.remove(); }, 4000);
    };

    // === Logika Modal (Popup) ===
    const openModal = (modal) => modal.style.display = 'flex';
    const closeModal = (modal) => modal.style.display = 'none';

    // Penutup modal utama
    modalCloseBtn.addEventListener('click', () => closeModal(projectModal));
    projectModal.addEventListener('click', (e) => {
        if (e.target === projectModal) closeModal(projectModal);
    });
    
    // === BARU: Logika Popup Konfirmasi Estetis (Promise-based) ===
    const showConfirmation = (title, message) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        openModal(confirmationModal);

        return new Promise((resolve) => {
            confirmBtnYes.onclick = () => {
                closeModal(confirmationModal);
                resolve(true);
            };
            confirmBtnNo.onclick = () => {
                closeModal(confirmationModal);
                resolve(false);
            };
        });
    };

    // === Logika API ===
    const callApi = async (action, data = {}) => {
        const password = sessionStorage.getItem('adminPassword');
        if (!password) {
            showNotification('Sesi admin tidak ditemukan. Harap login ulang.', 'error');
            throw new Error('Sesi admin tidak valid');
        }
        const response = await fetch('/api/create-website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data, adminPassword: password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
    };

    // === Fungsi Render & Event Listener ===
    // Fungsi untuk memuat API Key (tidak berubah)
    const loadApiKeys = async () => {
        keyListContainer.innerHTML = '<p>Memuat kunci...</p>';
        try {
            const keys = await callApi('getApiKeys');
            keyListContainer.innerHTML = '';
            if (Object.keys(keys).length === 0) {
                keyListContainer.innerHTML = '<p>Belum ada API Key yang dibuat.</p>'; return;
            }
            for (const key in keys) {
                const keyData = keys[key];
                const expiry = keyData.expires_at === 'permanent' ? 'Permanen' : `Kadaluwarsa: ${new Date(keyData.expires_at).toLocaleDateString('id-ID')}`;
                const item = document.createElement('div');
                item.className = 'key-item';
                item.innerHTML = `<div class="key-info"><span class="key-name">${key}</span><span class="key-expiry">${expiry}</span></div><button class="delete-btn" data-key="${key}"><i class="fas fa-trash-alt"></i></button>`;
                keyListContainer.appendChild(item);
            }
        } catch (error) {
            keyListContainer.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    };

    const renderProjects = (repos) => {
        modalBody.innerHTML = '';
        if (repos.length === 0) {
            modalBody.innerHTML = '<p>Tidak ada repositori yang ditemukan.</p>'; return;
        }
        repos.forEach(repo => {
            const item = document.createElement('div');
            item.className = 'repo-item';
            item.innerHTML = `
                <div class="repo-info">
                    <a href="${repo.url}" target="_blank">${repo.name}</a>
                    <span>${repo.private ? 'Private' : 'Public'}</span>
                </div>
                <div class="repo-actions">
                    <button class="delete-btn delete-repo-btn" data-name="${repo.name}">Hapus Repo</button>
                    <button class="delete-btn delete-vercel-btn" data-name="${repo.name}">Hapus Vercel</button>
                </div>`;
            modalBody.appendChild(item);
        });
    };

    manageProjectsBtn.addEventListener('click', async () => {
        modalTitle.textContent = 'Daftar Repositori & Proyek';
        modalBody.innerHTML = '<p>Memuat proyek...</p>';
        openModal(projectModal);
        try {
            const repos = await callApi('listRepos');
            renderProjects(repos);
        } catch (error) {
            showNotification(error.message, 'error');
            modalBody.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    });

    // === DIUBAH TOTAL: Logika Hapus dengan UI Dinamis & Popup Estetis ===
    modalBody.addEventListener('click', async (e) => {
        const targetButton = e.target.closest('button.delete-btn');
        if (!targetButton) return;

        const repoName = targetButton.dataset.name;
        let action, title, message, originalText;

        if (targetButton.classList.contains('delete-repo-btn')) {
            action = 'deleteRepo';
            title = 'Hapus Repositori GitHub?';
            message = `Tindakan ini akan menghapus permanen repositori '${repoName}' di GitHub dan tidak dapat diurungkan.`;
            originalText = 'Hapus Repo';
        } else if (targetButton.classList.contains('delete-vercel-btn')) {
            action = 'deleteVercelProject';
            title = 'Hapus Proyek Vercel?';
            message = `Ini akan menghapus proyek '${repoName}' dari Vercel, termasuk semua deployment dan domain yang terhubung.`;
            originalText = 'Hapus Vercel';
        } else {
            return;
        }
        
        const confirmed = await showConfirmation(title, message);

        if (confirmed) {
            targetButton.textContent = 'Menghapus...';
            targetButton.disabled = true;
            try {
                const result = await callApi(action, { repoName: repoName, projectName: repoName });
                showNotification(result.message, 'success');
                
                // Logika UI Dinamis
                const actionsContainer = targetButton.parentElement;
                targetButton.remove(); // Hapus tombol yang diklik

                // Jika sudah tidak ada tombol lain, hapus seluruh item dari daftar
                if (actionsContainer.children.length === 0) {
                    const repoItem = actionsContainer.parentElement;
                    repoItem.style.opacity = '0';
                    setTimeout(() => repoItem.remove(), 300);
                }
            } catch (error) {
                showNotification(error.message, 'error');
                targetButton.textContent = originalText;
                targetButton.disabled = false;
            }
        }
    });

    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) return showNotification('Password tidak boleh kosong.', 'error');
        sessionStorage.setItem('adminPassword', password);
        try {
            loginBtn.textContent = 'Memverifikasi...';
            loginBtn.disabled = true;
            await callApi('getApiKeys');
            loginScreen.style.display = 'none';
            adminPanel.style.display = 'block';
            loadApiKeys();
        } catch (error) {
            showNotification(`Login Gagal: ${error.message}`, 'error');
            sessionStorage.removeItem('adminPassword');
        } finally {
            loginBtn.textContent = 'Masuk';
            loginBtn.disabled = false;
        }
    });

    createKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyNameInput = document.getElementById('new-apikey-name');
        const data = {
            key: keyNameInput.value.trim(),
            duration: document.getElementById('new-apikey-duration').value,
            unit: document.getElementById('new-apikey-unit').value,
            isPermanent: permanentCheckbox.checked
        };
        try {
            const result = await callApi('createApiKey', data);
            showNotification(result.message, 'success');
            keyNameInput.value = '';
            loadApiKeys();
        } catch (error) {
            showNotification(`Gagal: ${error.message}`, 'error');
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
                    loadApiKeys();
                } catch (error) {
                    showNotification(`Gagal: ${error.message}`, 'error');
                }
            }
        }
    });

    permanentCheckbox.addEventListener('change', () => {
        durationSection.style.display = permanentCheckbox.checked ? 'none' : 'block';
    });

    // === Inisialisasi Tema dan Aplikasi ===
    const init = () => {
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; } 
        else { body.classList.remove('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }

        themeToggle.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('theme_preference_v1', newTheme);
            if (newTheme === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; }
            else { body.classList.remove('dark-mode'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }
        });

        setTimeout(() => {
            if (sessionStorage.getItem('adminPassword')) { loginBtn.click(); } 
            else { loginScreen.style.display = 'block'; }
            loadingOverlay.classList.add('hidden');
        }, 500);
    };
    init();
});