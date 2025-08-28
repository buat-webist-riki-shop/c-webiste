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
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalBody = document.getElementById('modal-body');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmTitle = document.getElementById('confirmation-modal-title');
    const confirmMessage = document.getElementById('confirmation-modal-message');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');

    // === Logika Notifikasi Estetis (DIUBAH) ===
    let notificationTimeout;
    const showNotification = (message, type = 'success') => {
        // Hapus notifikasi & timeout sebelumnya agar tidak menumpuk
        clearTimeout(notificationTimeout);
        notificationContainer.innerHTML = '';

        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        notificationContainer.appendChild(notif);
        
        notificationTimeout = setTimeout(() => {
             // Tambahkan class untuk fade out (opsional, jika ingin animasi)
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    };

    // === Logika Modal (Popup) ===
    const openModal = (modal) => modal.style.display = 'flex';
    const closeModal = (modal) => modal.style.display = 'none';
    modalCloseBtn.addEventListener('click', () => closeModal(projectModal));
    projectModal.addEventListener('click', (e) => {
        if (e.target === projectModal) closeModal(projectModal);
    });
    
    const showConfirmation = (title, message) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        openModal(confirmationModal);
        return new Promise((resolve) => {
            confirmBtnYes.onclick = () => { closeModal(confirmationModal); resolve(true); };
            confirmBtnNo.onclick = () => { closeModal(confirmationModal); resolve(false); };
        });
    };

    // === Logika API ===
    const callApi = async (action, data = {}) => {
        const password = localStorage.getItem('adminPassword'); 
        if (!password && action !== 'verifyPassword') { // Izinkan verifikasi tanpa notif
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

    // === Render Proyek (DIUBAH) ===
    const renderProjects = (projects) => {
        modalBody.innerHTML = '';
        if (projects.length === 0) {
            modalBody.innerHTML = '<p>Tidak ada proyek/repositori yang ditemukan.</p>'; return;
        }
        projects.forEach(proj => {
            const item = document.createElement('div');
            item.className = 'repo-item';

            const githubButton = proj.hasGithub 
                ? `<button class="delete-btn delete-repo-btn" data-name="${proj.name}">Hapus Repo</button>`
                : '';
            const vercelButton = proj.hasVercel
                ? `<button class="delete-btn delete-vercel-btn" data-name="${proj.name}">Hapus Vercel</button>`
                : '';
            
            const repoInfo = proj.hasGithub
                ? `<a href="${proj.githubUrl}" target="_blank">${proj.name}</a><span>${proj.isPrivate ? 'Private' : 'Public'}</span>`
                : `<strong>${proj.name}</strong><span>(Hanya ada di Vercel)</span>`

            item.innerHTML = `
                <div class="repo-info">${repoInfo}</div>
                <div class="repo-actions">${githubButton}${vercelButton}</div>`;
            modalBody.appendChild(item);
        });
    };
    
    // === Event Listener & Fungsi Utama (BANYAK PERUBAHAN) ===
    manageProjectsBtn.addEventListener('click', async () => {
        modalBody.innerHTML = '<p>Memuat proyek...</p>';
        openModal(projectModal);
        try {
            const projects = await callApi('listProjects'); // Panggil action baru
            renderProjects(projects);
        } catch (error) {
            showNotification(error.message, 'error');
            modalBody.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    });

    modalBody.addEventListener('click', async (e) => {
        // Logika hapus (tidak berubah, sudah bagus)
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

    const showAdminPanel = async () => {
        loginScreen.style.display = 'none';
        adminPanel.style.display = 'block';
        // Muat data yang relevan untuk panel admin
        const keyListContainer = document.getElementById('api-key-list-container');
        try {
            const keys = await callApi('getApiKeys');
            keyListContainer.innerHTML = '';
            if (Object.keys(keys).length === 0) {
                keyListContainer.innerHTML = '<p>Belum ada API Key yang dibuat.</p>'; return;
            }
            // (Kode render API key disederhanakan di sini, karena tidak berubah)
            for (const key in keys) { 
                const item = document.createElement('div');
                item.className = 'key-item';
                item.innerHTML = `<div class="key-info"><span class="key-name">${key}</span></div><button class="delete-btn" data-key="${key}"><i class="fas fa-trash-alt"></i></button>`;
                keyListContainer.appendChild(item);
            }
        } catch (error) {
            keyListContainer.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    };

    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) return showNotification('Password tidak boleh kosong.', 'error');
        localStorage.setItem('adminPassword', password); 
        
        loginBtn.textContent = 'Memverifikasi...'; loginBtn.disabled = true;
        try {
            await callApi('getApiKeys'); // Test call
            showAdminPanel();
        } catch (error) {
            showNotification(`Login Gagal: ${error.message}`, 'error');
            localStorage.removeItem('adminPassword'); 
        } finally {
            loginBtn.textContent = 'Masuk'; loginBtn.disabled = false;
        }
    });

    // --- FUNGSI BARU: Untuk login otomatis saat refresh ---
    const tryAutoLogin = async () => {
        if (localStorage.getItem('adminPassword')) {
            try {
                // Verifikasi senyap tanpa menampilkan error ke pengguna jika gagal
                await callApi('getApiKeys');
                showAdminPanel();
            } catch (error) {
                // Jika token/password lama tidak valid lagi
                localStorage.removeItem('adminPassword');
                loginScreen.style.display = 'block';
            }
        } else {
            loginScreen.style.display = 'block';
        }
        loadingOverlay.classList.add('hidden');
    };
    
    // --- Inisialisasi (DIUBAH) ---
    const init = () => {
        // Kode tema tidak berubah
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
        
        // Panggil fungsi auto-login
        setTimeout(() => {
            tryAutoLogin();
        }, 500);
    };
    
    init();
});