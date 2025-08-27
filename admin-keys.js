document.addEventListener('DOMContentLoaded', () => {
    // Elemen UI
    const loadingOverlay = document.getElementById('loading-overlay');
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const createKeyForm = document.getElementById('create-key-form');
    const keyListContainer = document.getElementById('api-key-list-container');
    const permanentCheckbox = document.getElementById('permanent-key');
    const durationSection = document.getElementById('duration-section');
    
    // PENAMBAHAN: Elemen UI untuk fitur manajemen proyek
    const manageProjectsBtn = document.getElementById('manage-projects-btn');
    const projectsModal = document.getElementById('projects-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const vercelProjectsList = document.getElementById('vercel-projects-list');
    const githubProjectsList = document.getElementById('github-projects-list');


    // Elemen Tema
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // --- LOGIKA TEMA TERANG/GELAP ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            body.classList.remove('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    };
    
    themeToggle.addEventListener('click', () => {
        const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme_preference_v1', newTheme);
        applyTheme(newTheme);
    });

    // --- LOGIKA UTAMA ---
    const callApi = async (action, data = {}) => {
        const password = sessionStorage.getItem('adminPassword');
        if (!password) {
            alert('Sesi admin tidak ditemukan. Harap login ulang.');
            // MODIFIKASI: Alihkan ke halaman login jika sesi tidak valid
            sessionStorage.removeItem('adminPassword');
            loginScreen.style.display = 'block';
            adminPanel.style.display = 'none';
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

    const loadApiKeys = async () => {
        keyListContainer.innerHTML = '<p>Memuat kunci...</p>';
        try {
            const keys = await callApi('getApiKeys');
            keyListContainer.innerHTML = '';
            if (Object.keys(keys).length === 0) {
                keyListContainer.innerHTML = '<p>Belum ada API Key yang dibuat.</p>';
                return;
            }
            for (const key in keys) {
                const keyData = keys[key];
                const expiry = keyData.expires_at === 'permanent' ? 'Permanen' 
                    : `Kadaluwarsa: ${new Date(keyData.expires_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`;
                
                const item = document.createElement('div');
                item.className = 'key-item';
                item.innerHTML = `
                    <div class="key-info">
                        <span class="key-name">${key}</span>
                        <span class="key-expiry">${expiry}</span>
                    </div>
                    <button class="delete-btn" data-key="${key}"><i class="fas fa-trash-alt"></i></button>
                `;
                keyListContainer.appendChild(item);
            }
        } catch (error) {
            keyListContainer.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    };

    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) return alert('Password tidak boleh kosong.');
        
        loginBtn.textContent = 'Memverifikasi...';
        loginBtn.disabled = true;

        try {
            // Tes panggilan API untuk memvalidasi password
            await callApi('getApiKeys', { tempPassword: password }); 
            sessionStorage.setItem('adminPassword', password);
            loginScreen.style.display = 'none';
            adminPanel.style.display = 'block';
            loadApiKeys();
        } catch (error) {
            alert(`Login Gagal: ${error.message}`);
            sessionStorage.removeItem('adminPassword');
        } finally {
            loginBtn.textContent = 'Masuk';
            loginBtn.disabled = false;
        }
    });

    createKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyNameInput = document.getElementById('new-apikey-name');
        if (!keyNameInput.value.trim()) return alert("Nama key tidak boleh kosong!");

        const data = {
            key: keyNameInput.value.trim(),
            duration: document.getElementById('new-apikey-duration').value,
            unit: document.getElementById('new-apikey-unit').value,
            isPermanent: permanentCheckbox.checked
        };
        try {
            const result = await callApi('createApiKey', data);
            alert(`Sukses: ${result.message}`);
            keyNameInput.value = '';
            loadApiKeys();
        } catch (error) {
            alert(`Gagal: ${error.message}`);
        }
    });
    
    keyListContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.delete-btn');
        if (button) {
            const key = button.dataset.key;
            if (confirm(`Yakin ingin menghapus kunci "${key}"?`)) {
                try {
                    const result = await callApi('deleteApiKey', { key });
                    alert(`Sukses: ${result.message}`);
                    loadApiKeys();
                } catch (error) {
                    alert(`Gagal: ${error.message}`);
                }
            }
        }
    });

    permanentCheckbox.addEventListener('change', () => {
        durationSection.style.display = permanentCheckbox.checked ? 'none' : 'block';
    });

    // --- PENAMBAHAN: Logika untuk manajemen proyek ---
    const renderProjectList = (container, projects, type) => {
        container.innerHTML = '';
        if (projects.length === 0) {
            container.innerHTML = `<p>Tidak ada proyek ${type} ditemukan.</p>`;
            return;
        }
        projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        projects.forEach(p => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.innerHTML = `
                <div class="project-info">
                    <span class="project-name">${p.name}</span>
                    <span class="project-date">Dibuat: ${new Date(p.createdAt).toLocaleDateString('id-ID')}</span>
                </div>
                <button class="delete-btn" data-name="${p.name}" data-type="${p.type}"><i class="fas fa-trash-alt"></i></button>
            `;
            container.appendChild(item);
        });
    };

    const loadProjects = async () => {
        vercelProjectsList.innerHTML = '<p>Memuat...</p>';
        githubProjectsList.innerHTML = '<p>Memuat...</p>';
        try {
            const { vercel, github } = await callApi('listProjects');
            renderProjectList(vercelProjectsList, vercel, 'Vercel');
            renderProjectList(githubProjectsList, github, 'GitHub');
        } catch (error) {
            vercelProjectsList.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
            githubProjectsList.innerHTML = `<p style="color: var(--error-color);">${error.message}</p>`;
        }
    };
    
    manageProjectsBtn.addEventListener('click', () => {
        projectsModal.classList.add('show');
        loadProjects();
    });

    modalCloseBtn.addEventListener('click', () => projectsModal.classList.remove('show'));
    projectsModal.addEventListener('click', (e) => {
        if (e.target === projectsModal) {
            projectsModal.classList.remove('show');
        }
    });

    const handleDeleteProject = async (e) => {
        const button = e.target.closest('.delete-btn');
        if (button) {
            const { name, type } = button.dataset;
            if (confirm(`PERINGATAN: Ini tidak dapat diurungkan!\nYakin ingin menghapus proyek '${name}' dari ${type}?`)) {
                try {
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    button.disabled = true;
                    const result = await callApi('deleteProject', { name, type });
                    alert(`Sukses: ${result.message}`);
                    loadProjects(); // Muat ulang daftar setelah berhasil
                } catch (error) {
                    alert(`Gagal: ${error.message}`);
                    button.innerHTML = '<i class="fas fa-trash-alt"></i>';
                    button.disabled = false;
                }
            }
        }
    };

    vercelProjectsList.addEventListener('click', handleDeleteProject);
    githubProjectsList.addEventListener('click', handleDeleteProject);

    // --- INISIALISASI ---
    const init = async () => {
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        applyTheme(savedTheme);

        try {
            if (sessionStorage.getItem('adminPassword')) {
                loginScreen.style.display = 'none';
                adminPanel.style.display = 'block';
                await loadApiKeys();
            } else {
                loginScreen.style.display = 'block';
            }
        } catch (error) {
            // Jika ada error (misal sesi kadaluarsa), tampilkan login
            loginScreen.style.display = 'block';
            adminPanel.style.display = 'none';
            sessionStorage.removeItem('adminPassword');
        } finally {
            // MODIFIKASI: Pastikan loading overlay selalu hilang
            loadingOverlay.classList.add('hidden');
        }
    };
    
    init();
});