// Archive View Module
window.ArchiveView = (function() {
    
    // --- STATE MANAGEMENT ---
    let state = {
        allHalls: [],
        selectedRows: [], // Stores hall codes of selected rows
        multiSelection: false,
    };
    let abortController;

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @param {object} options - Fetch options (method, body, etc.).
     * @returns {Promise<any>} - The JSON response data.
     */
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        if (isJson) {
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            return result.data || result;
        }
        return response;
    }

    async function fetchRawSchools() {
        return await fetchFromAPI(AppConfig.endpoints.allschool);
    }

    async function fetchRawDepartments() {
        return await fetchFromAPI(AppConfig.endpoints.alldept);
    }
    
    /**
     * Fetches all halls and formats them with school and department info.
     * @returns {Promise<Array>} A promise that resolves to an array of formatted hall objects.
     */
    async function fetchAllFormattedHalls() {
        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        return rawHalls.map(hall => {
             let incharge = { name: 'N/A', role: 'N/A' };
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);

             if (dept) incharge = { name: dept.incharge_name, role: 'HOD' };
             else if (school) incharge = { name: school.incharge_name, role: 'Dean' };

            return {
                id: hall.unique_id,
                hallCode: hall.unique_id,
                hallName: hall.name,
                school: school ? school.school_name : 'N/A',
                department: dept ? dept.department_name : 'N/A',
                features: Array.isArray(hall.features) ? hall.features.join(', ') : '',
                inchargeName: incharge.name,
                inchargeRole: incharge.role,
                status: hall.availability,
                date: new Date(hall.created_at).toLocaleDateString(),
                ...hall
            };
        });
    }

    /**
     * Fetches all halls and filters for the ones that are archived (not available).
     * @returns {Promise<Array>} A promise that resolves to an array of archived hall objects.
     */
    async function fetchArchivedHallData() {
        const allHalls = await fetchAllFormattedHalls();
        return allHalls.filter(hall => !hall.status);
    }
    
    /**
     * Updates a hall's data, typically to change its availability status.
     * @param {string} hallId - The ID of the hall to update.
     * @param {object} payload - The data to update.
     */
    async function updateHall(hallId, payload) {
        return await fetchFromAPI(`${AppConfig.endpoints.hall}/${hallId}`, { 
            method: 'PUT', 
            body: JSON.stringify(payload) 
        });
    }

    // --- RENDERING ---
    function renderArchivedHallTable() {
        const tableBody = document.getElementById('archived-hall-details-body');
        if (!tableBody) return;

        if (!state.allHalls || state.allHalls.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No archived details found.</td></tr>`;
            return;
        }
        
        const tableHtml = state.allHalls.map(hall => {
            const isSelected = state.selectedRows.includes(hall.hallCode);
            return `
            <tr data-hall-code="${hall.hallCode}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${hall.date}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.hallName}</div>
                    <div class="text-slate-400">${hall.hallCode}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.school}</div>
                    <div class="text-slate-400">${hall.department}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 max-w-xs truncate" title="${hall.features}">${hall.features}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.inchargeName}</div>
                    <div class="text-slate-400">${hall.inchargeRole}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-900/50 text-red-400">No</span>
                </td>
            </tr>
        `}).join('');

        tableBody.innerHTML = tableHtml;
        updateActionButtonsState();
    }
    
    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        document.getElementById('reactivate-btn').disabled = selectedCount === 0;
        
        const selectAllCheckbox = document.getElementById('select-all-archive-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.allHalls.length;
        }
    }

    function handleRowSelection(hallCode, isChecked) {
        if (!state.multiSelection) {
            state.selectedRows = isChecked ? [hallCode] : [];
        } else {
            if (isChecked && !state.selectedRows.includes(hallCode)) {
                state.selectedRows.push(hallCode);
            } else if (!isChecked) {
                state.selectedRows = state.selectedRows.filter(code => code !== hallCode);
            }
        }
        renderArchivedHallTable();
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        document.getElementById('archive-multiselect-toggle')?.addEventListener('change', (e) => {
            state.multiSelection = e.target.checked;
            if (!state.multiSelection) state.selectedRows = [];
            renderArchivedHallTable();
        }, { signal });
        
        document.getElementById('select-all-archive-checkbox')?.addEventListener('change', (e) => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.allHalls.map(h => h.hallCode) : [];
                renderArchivedHallTable();
            }
        }, { signal });
        
        document.getElementById('archived-hall-details-body')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const hallCode = e.target.closest('tr').dataset.hallCode;
                handleRowSelection(hallCode, e.target.checked);
            }
        }, { signal });

        document.getElementById('reactivate-btn')?.addEventListener('click', async () => {
            if (state.selectedRows.length === 0) return;

            if (confirm(`Are you sure you want to re-activate ${state.selectedRows.length} hall(s)?`)) {
                try {
                    const updatePromises = state.selectedRows.map(hallCode => {
                        const hallToUpdate = state.allHalls.find(h => h.hallCode === hallCode);
                        if (!hallToUpdate) {
                            console.error(`Hall with code ${hallCode} not found in state.`);
                            return Promise.resolve();
                        }

                        // Create a clean payload with all necessary fields for the backend API.
                        const payload = {
                            name: hallToUpdate.name,
                            type: hallToUpdate.type,
                            capacity: hallToUpdate.capacity,
                            floor: hallToUpdate.floor,
                            zone: hallToUpdate.zone,
                            belongs_to: hallToUpdate.belongs_to,
                            department_id: hallToUpdate.department_id,
                            school_id: hallToUpdate.school_id,
                            // FIX: Provide a default value of 0 if latitude/longitude are null.
                            latitude: hallToUpdate.latitude ?? 0,
                            longitude: hallToUpdate.longitude ?? 0,
                            // Ensure features is an array, as expected by the backend.
                            features: Array.isArray(hallToUpdate.features) 
                                ? hallToUpdate.features 
                                : (hallToUpdate.features ? hallToUpdate.features.split(',').map(f => f.trim()) : []),
                            availability: true // This is the actual change we want to make.
                        };
                        
                        return updateHall(hallCode, payload);
                    });

                    await Promise.all(updatePromises);
                    
                    alert('Hall(s) have been re-activated successfully.');
                    
                    state.selectedRows = [];
                    await initialize(); // Refresh the view
                } catch (error) {
                    console.error("Failed to reactivate halls:", error);
                    alert(`An error occurred while reactivating halls: ${error.message}`);
                }
            }
        }, { signal });
    }

    function cleanup() {
        if(abortController) abortController.abort();
        state = { allHalls: [], selectedRows: [], multiSelection: false };
        const multiSelectToggle = document.getElementById('archive-multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
    }

    async function initialize() {
        try {
            const data = await fetchArchivedHallData();
            state.allHalls = data;
            renderArchivedHallTable();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading archived hall details:', error);
            const tableBody = document.getElementById('archived-hall-details-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load archived data. ${error.message}</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
