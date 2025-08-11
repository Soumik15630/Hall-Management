// Hall Details View Module
window.HallDetailsView = (function() {
    
    // --- STATE MANAGEMENT ---
    let state = {
        allHalls: [],
        filteredHalls: [],
        selectedRows: [], // Stores hall codes of selected rows
        multiSelection: false,
        filters: {} // To store active column filters
    };
    // This will be populated lazily when the filter modal is opened
    let schoolsData = {};
    let abortController;

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };

        // Ensure Content-Type is set for methods with a body
        if (options.body && !config.headers['Content-Type']) {
            config.headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(fullUrl, config);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        if (isJson) {
            const text = await response.text();
            // Handle empty response body for 200 OK, etc.
            if (!text) return null; 
            try {
                const result = JSON.parse(text);
                return result.data || result;
            } catch (e) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("Invalid JSON response from server.");
            }
        }
        return response;
    }

    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }
    
    function mapHallType(apiType) {
        if (!apiType) return 'N/A';
        const type = apiType.toUpperCase();
        switch (type) {
            case 'SEMINAR': return 'Seminar';
            case 'LECTURE': return 'Lecture Hall';
            case 'CONFERENCE': return 'Conference Hall';
            case 'AUDITORIUM': return 'Auditorium';
            default: return formatTitleCase(apiType);
        }
    }

    async function fetchRawSchools() {
        return await fetchFromAPI(AppConfig.endpoints.allschool);
    }

    async function fetchRawDepartments() {
        return await fetchFromAPI(AppConfig.endpoints.alldept);
    }

    async function getSchools() {
        const [schoolsData, departmentsData] = await Promise.all([fetchRawSchools(), fetchRawDepartments()]);
        const schoolsMap = {};
        schoolsData.forEach(school => { schoolsMap[school.school_name] = []; });
        departmentsData.forEach(dept => {
            const school = schoolsData.find(s => s.unique_id === dept.school_id);
            if (school && schoolsMap[school.school_name]) {
                schoolsMap[school.school_name].push(dept.department_name);
            }
        });
        return schoolsMap;
    }
    
    function getFeatures() { 
        return ['WiFi', 'AC', 'Smartboard', 'Projector', 'Audio System', 'Computer', 'Podium', 'Ramp', 'Video Conferencing', 'Blackboard']; 
    }

    async function fetchHallsForHOD() {
        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        return rawHalls.map(hall => {
             let incharge = { name: 'N/A', role: 'N/A', email: 'N/A', phone: 'N/A' };
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);

             if (dept) {
                 incharge = { name: dept.incharge_name, role: 'HOD', email: dept.incharge_email, phone: dept.incharge_contact_number };
             } else if (school) {
                 incharge = { name: school.incharge_name, role: 'Dean', email: school.incharge_email, phone: school.incharge_contact_number };
             }

            return {
                id: hall.unique_id,
                hallCode: hall.unique_id,
                hallName: hall.name,
                type: mapHallType(hall.type),
                location: `${school ? school.school_name : 'Administration'}${dept ? ' - ' + dept.department_name : ''}`,
                capacity: hall.capacity,
                floor: formatTitleCase(hall.floor) + ' Floor',
                zone: formatTitleCase(hall.zone) + ' Zone',
                school: school ? school.school_name : 'N/A',
                department: dept ? dept.department_name : 'N/A',
                features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase).join(', ') : '',
                inchargeName: incharge.name,
                inchargeRole: incharge.role,
                inchargeEmail: incharge.email,
                inchargePhone: incharge.phone,
                status: hall.availability,
                date: new Date(hall.created_at).toLocaleDateString(), // Assuming created_at exists
                ...hall
            };
        });
    }

    // --- RENDERING ---
    function renderHallTable() {
        state.filteredHalls = [...state.allHalls]; // Simplified for now

        const tableBody = document.getElementById('hall-details-body');
        if (!tableBody) return;

        if (state.filteredHalls.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No details found.</td></tr>`;
            return;
        }
        
        const tableHtml = state.filteredHalls.map(hall => {
            const isSelected = state.selectedRows.includes(hall.hallCode);
            const statusColor = hall.status ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-400';
            const statusText = hall.status ? 'Yes' : 'No';

            return `
            <tr data-hall-code="${hall.hallCode}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${hall.date}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.hallName}</div>
                    <div class="text-slate-400">${hall.hallCode}</div>
                    <div class="text-slate-400">Capacity: ${hall.capacity}</div>
                    <div class="text-slate-400">${hall.floor}</div>
                    <div class="text-slate-400">${hall.zone}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.school}</div>
                    <div class="text-slate-400">${hall.department}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 max-w-xs truncate" title="${hall.features}">${hall.features}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.inchargeName}</div>
                    <div class="text-slate-400">${hall.inchargeRole}</div>
                    <div class="text-slate-400">${hall.inchargeEmail}</div>
                    <div class="text-slate-400">${hall.inchargePhone}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}">${statusText}</span>
                </td>
            </tr>
        `}).join('');

        tableBody.innerHTML = tableHtml;
        updateActionButtonsState();
        if (window.lucide) lucide.createIcons();
    }

    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        const statusBtn = document.getElementById('status-btn');
        const ownershipBtn = document.getElementById('ownership-btn');
        const featuresBtn = document.getElementById('features-btn');
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        
        if(statusBtn) statusBtn.disabled = selectedCount === 0;
        if(ownershipBtn) ownershipBtn.disabled = selectedCount === 0;
        if(featuresBtn) featuresBtn.disabled = selectedCount !== 1;
        
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.filteredHalls.length;
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
        renderHallTable();
    }

    // --- MODAL HANDLING ---
    function openModal(modalId) {
        document.getElementById('modal-backdrop').classList.remove('hidden');
        document.getElementById(modalId).classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-backdrop').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
        const dynamicModal = document.getElementById('transfer-ownership-modal');
        if (dynamicModal) dynamicModal.remove();
    }

    function setupModal(modalId, openBtnId, setupFn) {
        const openBtn = document.getElementById(openBtnId);
        if (!openBtn) return;

        openBtn.addEventListener('click', async () => {
            if (openBtn.disabled) return;
            try {
                if (setupFn) await setupFn();
                openModal(modalId);
            } catch (error) {
                console.error(`Error setting up modal "${modalId}":`, error);
            }
        });
    }

    // --- MODAL SPECIFIC LOGIC ---
    function setupUpdateStatusModal() {
        const isSingleSelection = state.selectedRows.length === 1;
        const hall = isSingleSelection ? state.allHalls.find(h => h.hallCode === state.selectedRows[0]) : null;
    
        const availableRadio = document.querySelector('input[name="status-option"][value="true"]');
        const unavailableRadio = document.querySelector('input[name="status-option"][value="false"]');
        
        // Default to 'Available' if multiple halls are selected, otherwise use the hall's current status.
        if (hall) {
            (hall.status ? availableRadio : unavailableRadio).checked = true;
        } else {
            availableRadio.checked = true;
        }
    
        const reasonContainer = document.getElementById('status-reason-container');
        const reasonTextarea = document.getElementById('status-reason-textarea');
        
        if (reasonTextarea) reasonTextarea.value = '';
        
        const shouldShowReason = unavailableRadio.checked;
        reasonContainer.classList.toggle('hidden', !shouldShowReason);
        
        document.querySelectorAll('input[name="status-option"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                reasonContainer.classList.toggle('hidden', e.target.value === 'true');
            });
        });
    }

    async function showTransferModal() {
        if (Object.keys(schoolsData).length === 0) {
            try {
                schoolsData = await getSchools();
            } catch (error) {
                alert("Could not load school and department data. Please try again.");
                return;
            }
        }
        // ... (rest of the dynamic modal creation logic remains the same)
    }

    function setupFeaturesModal() {
        const hall = state.allHalls.find(h => h.hallCode === state.selectedRows[0]);
        if (!hall) throw new Error("Selected hall data not found.");

        const allPossibleFeatures = getFeatures();
        const container = document.getElementById('features-checkbox-container');
        if (!container) throw new Error("Required modal element not found.");
        
        container.innerHTML = allPossibleFeatures.map(feature => {
            const currentFeatures = (hall.features || '').split(', ');
            const isChecked = currentFeatures.includes(feature);
            return `<label class="flex items-center text-slate-300"><input type="checkbox" value="${feature}" class="feature-checkbox form-checkbox h-4 w-4 bg-slate-800 text-blue-500 border-slate-600 rounded focus:ring-blue-500 mr-2" ${isChecked ? 'checked' : ''}>${feature}</label>`;
        }).join('');
    }

    /**
     * Handles the submission of the status update modal.
     * It constructs a PUT request to the /api/hall/:id endpoint for each selected hall.
     */
    async function handleStatusUpdate() {
        const submitBtn = document.getElementById('submit-status-update');
        const originalBtnHTML = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Updating...`;

        try {
            const newStatus = document.querySelector('input[name="status-option"]:checked').value === 'true';
            const reasonInput = document.getElementById('status-reason-textarea');
            const reason = reasonInput ? reasonInput.value.trim() : '';

            if (!newStatus && !reason) {
                alert('A reason is required when setting a hall to "Unavailable".');
                return; // Stop execution
            }

            const payload = { availability: newStatus };
            if (!newStatus) {
                payload.reason_for_unavailability = reason;
            }

            // Create an array of promises for all the API calls
            const updatePromises = state.selectedRows.map(hallId => {
                const endpoint = `/api/hall/${hallId}`;
                return fetchFromAPI(endpoint, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                }, false); // The PUT response might not have a body, so don't force JSON parsing of the response.
            });

            // Wait for all updates to complete
            await Promise.all(updatePromises);

            alert(`Successfully updated status for ${state.selectedRows.length} hall(s).`);
            closeModal();
            
            // Re-initialize to fetch the latest data and refresh the view
            await initialize(); 

        } catch (error) {
            console.error('Failed to update hall status:', error);
            alert(`An error occurred while updating status: ${error.message}. Please try again.`);
        } finally {
            // Restore button state regardless of success or failure
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    }

    /**
     * Handles the submission of the modify features modal.
     * It constructs a PUT request to the /api/hall/:id endpoint.
     */
    async function handleFeaturesUpdate() {
        const submitBtn = document.getElementById('submit-features-update');
        const originalBtnHTML = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Updating...`;

        try {
            const selectedFeatures = Array.from(document.querySelectorAll('.feature-checkbox:checked')).map(cb => cb.value);
            const hallId = state.selectedRows[0];

            if (!hallId) {
                throw new Error("No hall selected for feature update.");
            }

            const payload = { features: selectedFeatures };
            const endpoint = `/api/hall/${hallId}`;

            await fetchFromAPI(endpoint, {
                method: 'PUT',
                body: JSON.stringify(payload)
            }, false); // The PUT response might not have a body, so don't force JSON parsing of the response.

            alert(`Successfully updated features for hall ${hallId}.`);
            closeModal();
            
            // Re-initialize to fetch the latest data and refresh the view
            await initialize();

        } catch (error) {
            console.error('Failed to update hall features:', error);
            alert(`An error occurred while updating features: ${error.message}. Please try again.`);
        } finally {
            // Restore button state regardless of success or failure
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    }


    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        document.getElementById('multiselect-toggle')?.addEventListener('change', (e) => {
            state.multiSelection = e.target.checked;
            state.selectedRows = state.multiSelection ? state.selectedRows : [];
            renderHallTable();
        }, { signal });
        
        document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.filteredHalls.map(h => h.hallCode) : [];
                renderHallTable();
            }
        }, { signal });
        
        document.getElementById('hall-details-body')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const hallCode = e.target.closest('tr').dataset.hallCode;
                handleRowSelection(hallCode, e.target.checked);
            }
        }, { signal });

        setupModal('update-status-modal', 'status-btn', setupUpdateStatusModal);
        setupModal('transfer-ownership-modal', 'ownership-btn', showTransferModal);
        setupModal('modify-features-modal', 'features-btn', setupFeaturesModal);

        document.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', closeModal, { signal }));
        document.getElementById('modal-backdrop')?.addEventListener('click', closeModal, { signal });
        
        // --- MODAL SUBMISSION LOGIC ---
        document.getElementById('submit-status-update')?.addEventListener('click', handleStatusUpdate, { signal });
        document.getElementById('submit-features-update')?.addEventListener('click', handleFeaturesUpdate, { signal });
    }
    
    function cleanup() {
        if(abortController) abortController.abort();
        state = { allHalls: [], filteredHalls: [], selectedRows: [], multiSelection: false, filters: {} };
        const multiSelectToggle = document.getElementById('multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
        closeModal();
    }

    async function initialize() {
        try {
            const halls = await fetchHallsForHOD();
            state.allHalls = halls;
            renderHallTable();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading hall details:', error);
            const tableBody = document.getElementById('hall-details-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load hall data. Please try again.</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
