/*
 * File: frontend/scripts/site-ui.js
 * Project: Access for All Engine Starter
 *
 * Purpose: Bind the navigation drawer and accessibility engine panel to the page.
 * What this file controls:
 *   - mobile navigation drawer (right-side)
 *   - accessibility engine modal (desktop) / left-side drawer (mobile)
 *   - focus trapping, tap-away close, escape key handling
 *   - swipe-to-dismiss gestures (mobile)
 *   - engine form wiring: live preview, save, reset
 *   - mobile branch navigation (theme / colour / layout / text / spacing / support)
 *   - read-aloud controls
 *   - consent banner and modal
 *   - contact form submission
 *   - tab panel widget (data-platform-explorer)
 *
 * Load order: after accessibility-engine.js
 *
 * Source: cleaned production engine build.
 *         Site-specific modules removed before publishing this starter.
 *         Landmark field replaces highlightControls in acMobileBranches.
 */

(function siteUiBootstrap() {
    /* ============================================================
       DOM LOOKUP
    ============================================================ */

    var engine = window.accessibilityEngine;

    if (!engine) {
        return;
    }

    var body    = document.body;
    var root    = document.documentElement;
    var header  = document.querySelector("[data-site-header]");
    var nav     = document.querySelector("[data-primary-nav]");
    var navToggle = document.querySelector("[data-nav-toggle]");
    var navMenu = nav
        ? nav.querySelector(".nav-list")
        : document.getElementById("primary-navigation");
    var navClose = document.querySelector("[data-nav-close]");
    var navAccessibilityShortcut = null;
    var modal        = document.querySelector("[data-accessibility-modal]");
    var modalPanel   = modal ? modal.querySelector(".modal-panel")   : null;
    var modalHeader  = modal ? modal.querySelector(".modal-header")  : null;
    var modalContent = modal ? modal.querySelector(".modal-content") : null;
    var backdrop     = document.querySelector("[data-modal-backdrop]");
    var openButtons  = document.querySelectorAll("[data-accessibility-open]");
    var closeButtons = document.querySelectorAll("[data-accessibility-close]");
    var form         = document.querySelector("[data-accessibility-form]");
    var formFooter   = form ? form.querySelector(".engine-form__footer") : null;
    var saveButton   = document.querySelector("[data-accessibility-save]");
    var resetButton  = document.querySelector("[data-accessibility-reset]");
    var status       = document.querySelector("[data-accessibility-status]");
    var speechPlayButton  = document.querySelector("[data-speech-play]");
    var speechPauseButton = document.querySelector("[data-speech-pause]");
    var speechStopButton  = document.querySelector("[data-speech-stop]");
    var speechStatus      = document.querySelector("[data-speech-status]");

    var consentStorageKey        = "gm-consent-state";
    var consentStorageVersionKey = "gm-consent-version";
    var consentStorageVersion    = "1";

    var talkbackEnabledField = form
        ? form.querySelector('[name="talkbackEnabled"]')
        : null;
    var talkbackInvocationField = form
        ? form.querySelector('[name="talkbackInvocation"]')
        : null;
    var legacyTalkbackModeField = form
        ? form.querySelector('[name="talkbackMode"]')
        : null;

    var mobileQuery =
        window.matchMedia && typeof window.matchMedia === "function"
            ? window.matchMedia("(max-width: 48rem)")
            : null;

    var lastFocusedElement    = null;
    var lastNavFocusedElement = null;
    var suppressedMobileState = null;

    /* Mobile engine drawer branch definitions.
       Each branch maps a label to the engine control fields that belong to it.
       The "focus" branch now includes "landmark" instead of "highlightControls". */
    var acMobileBranches = [
        { id: "theme",   label: "Theme",   fields: ["appearance"] },
        { id: "colour",  label: "Colour",  fields: ["palette", "contrast", "tint", "filterStrength"] },
        { id: "layout",  label: "Layout",  fields: ["depth", "transparency", "motion"] },
        { id: "text",    label: "Text",    fields: ["font", "boldText", "readingMode"] },
        { id: "spacing", label: "Spacing", fields: ["fontScale", "lineSpacing", "paragraphSpacing", "letterSpacing", "wordSpacing"] },
        { id: "support", label: "Support", fields: ["focusBoost", "underlineLinks", "landmark"] },
        { id: "media",   label: "Media",   fields: ["dimMedia"] },
    ];

    var activeAcMobileBranch = null;

    /* ============================================================
       HELPERS
    ============================================================ */

    function isMobile() {
        if (!mobileQuery) {
            return window.innerWidth <= 768;
        }

        return mobileQuery.matches;
    }

    function isMobilePlatform() {
        var userAgent = navigator.userAgent || "";

        return (
            /Android/i.test(userAgent) ||
            /iPad|iPhone|iPod/.test(userAgent) ||
            (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1)
        );
    }

    function isMobileEngineRuntime() {
        return isMobile() || isMobilePlatform();
    }

    function canUseRuntimeTalkback() {
        return !isMobileEngineRuntime() && engine.isSpeechSupported();
    }

    function isTalkbackExplicitlyEnabled() {
        if (!engine || typeof engine.getState !== "function") {
            return false;
        }

        var currentState = engine.getState();

        return (
            currentState &&
            currentState.talkbackMode &&
            currentState.talkbackMode !== engine.defaults.talkbackMode
        );
    }

    function syncDeviceDataset() {
        if (!root) {
            return;
        }

        root.dataset.device        = isMobile() ? "mobile" : "desktop";
        root.dataset.engineRuntime = isMobileEngineRuntime() ? "mobile" : "desktop";
    }

    /* setMobileHidden — hides/shows an element and disables/re-enables
       all its form fields to keep them out of keyboard and form-data scope. */
    function setMobileHidden(target, hidden) {
        var shouldHide = Boolean(hidden);

        if (!target) {
            return;
        }

        target.hidden = shouldHide;
        target.setAttribute("aria-hidden", shouldHide ? "true" : "false");
        target.dataset.mobileHidden = shouldHide ? "true" : "false";

        if ("inert" in target) {
            target.inert = shouldHide;
        }

        Array.from(target.querySelectorAll("select, input, textarea, button")).forEach(function syncDisabledState(field) {
            if (shouldHide) {
                if (!field.hasAttribute("data-mobile-disabled")) {
                    field.setAttribute("data-mobile-disabled", field.disabled ? "true" : "false");
                }

                field.disabled = true;
                return;
            }

            if (field.hasAttribute("data-mobile-disabled")) {
                field.disabled = field.getAttribute("data-mobile-disabled") === "true";
                field.removeAttribute("data-mobile-disabled");
            }
        });
    }

    function setStatus(message) {
        if (status) {
            status.textContent = message || "";
        }
    }

    function readLocalStorageValue(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeLocalStorageValue(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            return;
        }
    }

    function removeLocalStorageValue(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (error) {
            return;
        }
    }

    function getFocusableElements(scope) {
        if (!scope) {
            return [];
        }

        return Array.from(
            scope.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
        );
    }

    function makeDecorativeCloneSafe(target) {
        if (!target) {
            return;
        }

        target.setAttribute("aria-hidden", "true");

        Array.from(
            target.querySelectorAll('a, button, input, select, textarea, [tabindex]'),
        ).forEach(function disableDecorativeFocus(node) {
            node.setAttribute("tabindex", "-1");
            node.setAttribute("aria-hidden", "true");

            if (node.tagName === "A") {
                node.removeAttribute("href");
            }
        });
    }

    function syncBackdrop() {
        if (!backdrop) {
            return;
        }

        var isModalOpen = modal && !modal.hidden;
        var isNavOpen   = header && header.dataset.navOpen === "true" && isMobile();
        backdrop.hidden = !(isModalOpen || isNavOpen);
    }

    function syncSpeechUi(nextSpeechState) {
        if (speechStatus) {
            speechStatus.textContent = nextSpeechState.label;
        }

        if (speechPlayButton) {
            speechPlayButton.disabled = !nextSpeechState.supported;
            speechPlayButton.textContent =
                nextSpeechState.source === "page" &&
                nextSpeechState.speaking &&
                !nextSpeechState.paused
                    ? "Restart page reading"
                    : "Read page aloud";
        }

        if (speechPauseButton) {
            speechPauseButton.disabled =
                !nextSpeechState.supported ||
                nextSpeechState.source !== "page" ||
                !nextSpeechState.speaking;
            speechPauseButton.textContent = nextSpeechState.paused ? "Resume" : "Pause";
        }

        if (speechStopButton) {
            speechStopButton.disabled =
                !nextSpeechState.supported ||
                nextSpeechState.source !== "page" ||
                !nextSpeechState.speaking;
            speechStopButton.textContent = "Stop";
        }
    }

    function syncTalkbackControls() {
        if (!talkbackEnabledField || !talkbackInvocationField) {
            return;
        }

        talkbackInvocationField.disabled = talkbackEnabledField.value !== "on";
    }

    function syncMobileDirectChoiceUi() {
        if (!form) {
            return;
        }

        Array.from(form.querySelectorAll("[data-mobile-direct-choice-group]")).forEach(function syncDirectChoiceGroup(group) {
            var fieldName = group.getAttribute("data-mobile-direct-choice-group");
            var field = fieldName ? form.querySelector('[name="' + fieldName + '"]') : null;

            if (!field) {
                return;
            }

            Array.from(group.querySelectorAll("[data-mobile-direct-choice-value]")).forEach(function syncDirectChoiceButton(button) {
                var isActive = button.getAttribute("data-mobile-direct-choice-value") === String(field.value);
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
                button.classList.toggle("is-active", isActive);
            });
        });
    }

    function syncEngineCapabilityUi() {
        var readingGuideField = form ? form.querySelector('[name="readingGuide"]') : null;
        var talkbackField     = talkbackEnabledField || legacyTalkbackModeField;
        var talkbackGroup     = talkbackField ? talkbackField.closest(".control-group") : null;
        var readingGuideStack = readingGuideField ? readingGuideField.closest(".control-stack") : null;
        var shouldHideTalkback    = isMobileEngineRuntime() || !canUseRuntimeTalkback();
        var shouldHideReadingGuide = isMobileEngineRuntime();
        var hasSuppressedState    = false;
        var currentState          = null;
        var nextState             = null;

        syncDeviceDataset();

        if (!form) {
            return;
        }

        setMobileHidden(talkbackGroup, shouldHideTalkback);
        setMobileHidden(readingGuideStack, shouldHideReadingGuide);

        currentState          = engine.getState();
        nextState             = { ...currentState };
        suppressedMobileState = suppressedMobileState || {};

        if (shouldHideTalkback) {
            if (currentState.talkbackMode !== engine.defaults.talkbackMode) {
                suppressedMobileState.talkbackMode = currentState.talkbackMode;
                nextState.talkbackMode = engine.defaults.talkbackMode;
                hasSuppressedState = true;
            }
        } else if (Object.prototype.hasOwnProperty.call(suppressedMobileState, "talkbackMode")) {
            nextState.talkbackMode = suppressedMobileState.talkbackMode;
            delete suppressedMobileState.talkbackMode;
            hasSuppressedState = true;
        }

        if (shouldHideReadingGuide) {
            if (currentState.readingGuide !== engine.defaults.readingGuide) {
                suppressedMobileState.readingGuide = currentState.readingGuide;
                nextState.readingGuide = engine.defaults.readingGuide;
                hasSuppressedState = true;
            }
        } else if (Object.prototype.hasOwnProperty.call(suppressedMobileState, "readingGuide")) {
            nextState.readingGuide = suppressedMobileState.readingGuide;
            delete suppressedMobileState.readingGuide;
            hasSuppressedState = true;
        }

        if (suppressedMobileState && Object.keys(suppressedMobileState).length === 0) {
            suppressedMobileState = null;
        }

        if (hasSuppressedState) {
            engine.updateState(nextState, false);
        }

        engine.syncForms();
        syncMobileDirectChoiceUi();
        syncTalkbackControls();
    }

    function getActiveAccessibilityScope() {
        var mobilePanel = modal ? modal.querySelector(".ac-mobile-panel") : null;

        if (isMobile() && mobilePanel && !mobilePanel.hidden) {
            return mobilePanel;
        }

        return modalPanel || modal;
    }

    /* syncAccessibilityView — moves DOM nodes between desktop modal and mobile
       drawer depending on current viewport, avoiding duplicate content. */
    function syncAccessibilityView() {
        var mobilePanel   = modal ? modal.querySelector(".ac-mobile-panel") : null;
        var mobileMenu    = mobilePanel ? mobilePanel.querySelector(".ac-mobile-menu") : null;
        var mobileActions = mobilePanel ? mobilePanel.querySelector(".ac-mobile-actions") : null;
        var mobileContent = mobilePanel ? mobilePanel.querySelector(".ac-mobile-content") : null;
        var mobileBack    = mobilePanel ? mobilePanel.querySelector(".ac-mobile-back") : null;
        var footer        = formFooter;
        var useMobile     = isMobile();

        if (!modal || !modalPanel || !modalHeader || !modalContent || !mobilePanel || !mobileContent || !mobileMenu || !mobileActions || !footer) {
            return;
        }

        modalHeader.hidden = false;
        modalHeader.setAttribute("aria-hidden", "false");
        if ("inert" in modalHeader) { modalHeader.inert = false; }

        if (useMobile) {
            if (modalContent.parentNode !== mobileContent) {
                mobileContent.appendChild(modalContent);
            }

            if (footer.parentNode !== mobileActions) {
                mobileActions.appendChild(footer);
            }

            modalPanel.hidden = true;
            modalPanel.setAttribute("aria-hidden", "true");
            if ("inert" in modalPanel) { modalPanel.inert = true; }

            modalHeader.hidden = true;
            modalHeader.setAttribute("aria-hidden", "true");
            if ("inert" in modalHeader) { modalHeader.inert = true; }

            mobilePanel.hidden = false;
            mobilePanel.setAttribute("aria-hidden", "false");
            if ("inert" in mobilePanel) { mobilePanel.inert = false; }

            mobilePanel.dataset.mode = "mobile";
            modalPanel.dataset.mode  = "desktop-hidden";
            setAcMobileBranch(activeAcMobileBranch);
            return;
        }

        if (footer.parentNode !== form) {
            form.appendChild(footer);
        }

        if (modalContent.parentNode !== modalPanel) {
            modalPanel.appendChild(modalContent);
        }

        modalPanel.hidden = false;
        modalPanel.setAttribute("aria-hidden", "false");
        if ("inert" in modalPanel) { modalPanel.inert = false; }

        modalHeader.hidden = false;
        modalHeader.setAttribute("aria-hidden", "false");
        if ("inert" in modalHeader) { modalHeader.inert = false; }

        mobilePanel.hidden = true;
        mobilePanel.setAttribute("aria-hidden", "true");
        if ("inert" in mobilePanel) { mobilePanel.inert = true; }

        modalPanel.dataset.mode  = "desktop";
        mobilePanel.dataset.mode = "mobile-hidden";
        activeAcMobileBranch = null;

        modalContent.hidden = false;
        modalContent.setAttribute("aria-hidden", "false");
        if ("inert" in modalContent) { modalContent.inert = false; }

        resetAcControlVisibility();

        if (mobileBack) {
            mobileBack.setAttribute("aria-disabled", "true");
            mobileBack.tabIndex = -1;
        }
    }

    /* setAcMobileControlVisibility — shows/hides control-group and control-stack
       elements based on which branch is active in the mobile drawer. */
    function setAcMobileControlVisibility(branchId) {
        if (!form) {
            return;
        }

        Array.from(form.querySelectorAll(".control-group")).forEach(function syncGroup(group) {
            var stacks      = Array.from(group.querySelectorAll(".control-stack"));
            var hasVisible  = false;
            var description = group.querySelector(".control-group__description");
            var buttonRow   = group.querySelector(".tool-button-row");
            var note        = group.querySelector(".engine-note");

            stacks.forEach(function syncStack(stack) {
                var control     = stack.querySelector("select, input, textarea");
                var controlName = control ? control.getAttribute("name") : "";
                var shouldShow  =
                    !branchId ||
                    (controlName &&
                        acMobileBranches.some(function matchBranch(branch) {
                            return branch.id === branchId && branch.fields.indexOf(controlName) !== -1;
                        }));

                stack.hidden = !shouldShow;

                if (shouldShow) {
                    hasVisible = true;
                }
            });

            group.hidden = Boolean(branchId) && !hasVisible;

            if (description)  { description.hidden = Boolean(branchId); }
            if (buttonRow)    { buttonRow.hidden = true; }
            if (note)         { note.hidden = true; }
        });
    }

    function resetAcControlVisibility() {
        if (!form) {
            return;
        }

        Array.from(form.querySelectorAll(".control-group")).forEach(function resetGroup(group) {
            var description = group.querySelector(".control-group__description");
            var buttonRow   = group.querySelector(".tool-button-row");
            var note        = group.querySelector(".engine-note");

            group.hidden = false;

            Array.from(group.querySelectorAll(".control-stack")).forEach(function resetStack(stack) {
                stack.hidden = false;
            });

            if (description) { description.hidden = false; }
            if (buttonRow)   { buttonRow.hidden = false; }
            if (note)        { note.hidden = false; }
        });
    }

    function setAcMobileBranch(branchId) {
        var mobilePanel   = modal ? modal.querySelector(".ac-mobile-panel") : null;
        var mobileMenu    = mobilePanel ? mobilePanel.querySelector(".ac-mobile-menu") : null;
        var mobileContent = mobilePanel ? mobilePanel.querySelector(".ac-mobile-content") : null;
        var mobileBack    = mobilePanel ? mobilePanel.querySelector(".ac-mobile-back") : null;
        var triggers      = mobilePanel
            ? Array.from(mobilePanel.querySelectorAll("[data-ac-mobile-branch-trigger]"))
            : [];
        var useBranch = Boolean(branchId);

        if (!mobilePanel || !mobileMenu || !mobileContent || !mobileBack) {
            return;
        }

        activeAcMobileBranch             = useBranch ? branchId : null;
        mobilePanel.dataset.activeBranch = activeAcMobileBranch || "root";
        mobileContent.dataset.acBranch   = activeAcMobileBranch || "root";

        mobileMenu.hidden = useBranch;
        mobileMenu.setAttribute("aria-hidden", useBranch ? "true" : "false");
        if ("inert" in mobileMenu) { mobileMenu.inert = useBranch; }

        modalContent.hidden = !useBranch;
        modalContent.setAttribute("aria-hidden", useBranch ? "false" : "true");
        if ("inert" in modalContent) { modalContent.inert = !useBranch; }

        mobileContent.hidden = false;
        mobileContent.setAttribute("aria-hidden", "false");
        if ("inert" in mobileContent) { mobileContent.inert = false; }

        setAcMobileControlVisibility(activeAcMobileBranch);

        mobileBack.setAttribute("aria-disabled", useBranch ? "false" : "true");
        mobileBack.tabIndex = useBranch ? 0 : -1;

        triggers.forEach(function syncTriggerState(trigger) {
            var isActive =
                useBranch &&
                trigger.getAttribute("data-ac-mobile-branch-trigger") === branchId;

            trigger.setAttribute("aria-current", isActive ? "page" : "false");
        });
    }

    function collectFormState() {
        var formData           = new window.FormData(form);
        var currentState       = engine.getState();
        var talkbackMode       = engine.defaults.talkbackMode;
        var talkbackEnabled    = formData.get("talkbackEnabled");
        var talkbackInvocation = formData.get("talkbackInvocation") || "both";
        var mobileEngineRuntime = isMobileEngineRuntime();
        var talkbackAllowed    = canUseRuntimeTalkback();

        function getFieldValue(name, fallback) {
            var value = formData.get(name);
            return value === null ? fallback : value;
        }

        function getSupportLevel(name) {
            var field = form.querySelector('[name="' + name + '"]');

            if (!field) {
                return currentState[name];
            }

            if (field.type === "checkbox") {
                return field.checked ? "medium" : currentState[name];
            }

            return getFieldValue(name, currentState[name]);
        }

        if (talkbackEnabledField || talkbackInvocationField) {
            talkbackMode = !talkbackAllowed
                ? engine.defaults.talkbackMode
                : talkbackEnabled === "on"
                  ? talkbackInvocation
                  : "off";
        } else {
            talkbackMode = !talkbackAllowed
                ? engine.defaults.talkbackMode
                : getFieldValue("talkbackMode", currentState.talkbackMode);
        }

        return {
            appearance:       getFieldValue("appearance", currentState.appearance),
            palette:          getFieldValue("palette", currentState.palette),
            contrast:         getFieldValue("contrast", currentState.contrast),
            depth:            getFieldValue("depth", currentState.depth),
            font:             getFieldValue("font", currentState.font),
            tint:             getFieldValue("tint", currentState.tint),
            filterStrength:   getFieldValue("filterStrength", currentState.filterStrength),
            readingMode:      getFieldValue("readingMode", currentState.readingMode),
            readingGuide:     mobileEngineRuntime
                ? engine.defaults.readingGuide
                : getFieldValue("readingGuide", currentState.readingGuide),
            talkbackMode:     talkbackMode,
            speechRate:       Number(getFieldValue("speechRate", currentState.speechRate)),
            fontScale:        Number(getFieldValue("fontScale", currentState.fontScale)),
            lineSpacing:      Number(getFieldValue("lineSpacing", currentState.lineSpacing)),
            paragraphSpacing: Number(getFieldValue("paragraphSpacing", currentState.paragraphSpacing)),
            letterSpacing:    Number(getFieldValue("letterSpacing", currentState.letterSpacing)),
            wordSpacing:      Number(getFieldValue("wordSpacing", currentState.wordSpacing)),
            boldText:         getFieldValue("boldText", currentState.boldText),
            motion:           getFieldValue("motion", currentState.motion),
            transparency:     getFieldValue("transparency", currentState.transparency),
            focusBoost:       getSupportLevel("focusBoost"),
            underlineLinks:   getSupportLevel("underlineLinks"),
            landmark:         getFieldValue("landmark", currentState.landmark),
            dimMedia:         getSupportLevel("dimMedia"),
        };
    }

    /* ============================================================
       NAVIGATION STATE
    ============================================================ */

    function syncNavigationState(isOpen, options) {
        var shouldOpen        = Boolean(isOpen);
        var shouldRestoreFocus = options && options.restoreFocus;
        var shouldMoveFocus    = options && options.moveFocus;

        if (!header || !nav || !navToggle) {
            return;
        }

        if (!isMobile()) {
            header.dataset.navOpen = "false";
            nav.hidden = false;
            navToggle.setAttribute("aria-expanded", "false");
            navToggle.setAttribute("aria-label", "Open menu");
            navToggle.textContent = "Open menu";
            syncBackdrop();
            return;
        }

        header.dataset.navOpen = String(shouldOpen);
        nav.hidden = false;
        navToggle.setAttribute("aria-expanded", String(shouldOpen));
        navToggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");
        navToggle.textContent = shouldOpen ? "Close menu" : "Open menu";
        body.dataset.drawerOpen = shouldOpen ? "true" : "false";
        syncBackdrop();

        if (shouldOpen && shouldMoveFocus) {
            if (navClose && typeof navClose.focus === "function") {
                navClose.focus();
                return;
            }

            var navFocusables = getFocusableElements(nav);

            if (navFocusables.length > 0) {
                navFocusables[0].focus();
            }
        }

        if (!shouldOpen) {
            delete body.dataset.drawerOpen;
        }

        if (!shouldOpen && shouldRestoreFocus && lastNavFocusedElement) {
            lastNavFocusedElement.focus();
        }
    }

    /* ============================================================
       MODAL OPEN / CLOSE
    ============================================================ */

    function openModal() {
        var focusTarget   = null;
        var talkbackScope = null;
        var shouldMoveFocus = false;

        if (!modal) {
            return;
        }

        syncNavigationState(false);
        lastFocusedElement = document.activeElement;
        modal.hidden = false;
        body.dataset.modalOpen = "true";
        syncAccessibilityView();
        syncEngineCapabilityUi();

        openButtons.forEach(function updateButton(button) {
            button.setAttribute("aria-expanded", "true");
        });

        talkbackScope = getActiveAccessibilityScope() || modal;

        if (canUseRuntimeTalkback() && isTalkbackExplicitlyEnabled()) {
            engine.activateScopedTalkback(talkbackScope);
        } else {
            engine.deactivateScopedTalkback();

            if (typeof engine.stopReadAloud === "function") {
                engine.stopReadAloud();
            }
        }

        syncBackdrop();
        setStatus("Changes apply straight away. Save them if you want them next time.");
        shouldMoveFocus = !isMobileEngineRuntime();

        if (shouldMoveFocus) {
            focusTarget =
                (talkbackScope &&
                    talkbackScope.querySelector(
                        'select:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-accessibility-back])',
                    )) ||
                (talkbackScope &&
                    talkbackScope.querySelector(
                        "[data-speech-play], [data-accessibility-close], [data-accessibility-back]",
                    ));
        }

        if (focusTarget && typeof focusTarget.focus === "function") {
            focusTarget.focus();
        }

        syncMobileDirectChoiceUi();
    }

    function closeModal(options) {
        var shouldRestoreFocus = !options || options.restoreFocus !== false;

        if (!modal) {
            return;
        }

        modal.hidden = true;
        delete body.dataset.modalOpen;
        engine.deactivateScopedTalkback();

        openButtons.forEach(function updateButton(button) {
            button.setAttribute("aria-expanded", "false");
        });

        syncBackdrop();

        if (shouldRestoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === "function") {
            lastFocusedElement.focus();
        }
    }

    /* ============================================================
       FOCUS TRAP
    ============================================================ */

    function trapFocus(event) {
        if (event.key !== "Tab") {
            return;
        }

        var scope = null;

        if (body.dataset.consentOpen === "true") {
            scope = document.querySelector("[data-consent-modal-panel]");
        } else if (modal && !modal.hidden) {
            scope = getActiveAccessibilityScope();
        } else if (header && header.dataset.navOpen === "true" && isMobile()) {
            scope = nav;
        }

        if (!scope) {
            return;
        }

        var focusableElements = getFocusableElements(scope);

        if (focusableElements.length === 0) {
            return;
        }

        var firstElement = focusableElements[0];
        var lastElement  = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    /* ============================================================
       CONSENT
    ============================================================ */

    function getDefaultConsentState() {
        return {
            essential:    true,
            analytics:    false,
            marketing:    false,
            decisionMade: false,
            updatedAt:    "",
        };
    }

    function normalizeConsentState(rawState) {
        var defaults = getDefaultConsentState();
        var nextState = rawState || {};

        return {
            essential:    true,
            analytics:    Boolean(nextState.analytics),
            marketing:    Boolean(nextState.marketing),
            decisionMade: Boolean(nextState.decisionMade),
            updatedAt:    nextState.updatedAt || defaults.updatedAt,
        };
    }

    function readConsentState() {
        var version  = readLocalStorageValue(consentStorageVersionKey);
        var rawState = readLocalStorageValue(consentStorageKey);

        if (version !== consentStorageVersion) {
            removeLocalStorageValue(consentStorageKey);
            writeLocalStorageValue(consentStorageVersionKey, consentStorageVersion);
            return getDefaultConsentState();
        }

        if (!rawState) {
            return getDefaultConsentState();
        }

        try {
            return normalizeConsentState(JSON.parse(rawState));
        } catch (error) {
            return getDefaultConsentState();
        }
    }

    function writeConsentState(nextState) {
        var normalizedState = normalizeConsentState(nextState);
        normalizedState.updatedAt = new Date().toISOString();
        writeLocalStorageValue(consentStorageVersionKey, consentStorageVersion);
        writeLocalStorageValue(consentStorageKey, JSON.stringify(normalizedState));
        return normalizedState;
    }

    function setElementHidden(node, shouldHide) {
        if (!node) {
            return;
        }

        if (shouldHide) {
            node.setAttribute("hidden", "");
            return;
        }

        node.removeAttribute("hidden");
    }

    function buildConsentUi() {
        if (
            document.querySelector("[data-consent-banner]") ||
            document.querySelector("[data-consent-modal]")
        ) {
            return;
        }

        var wrapper = document.createElement("div");
        wrapper.innerHTML =
            '<div class="consent-banner" data-consent-banner hidden>' +
            '  <div class="consent-banner__panel" role="region" aria-label="Cookie and storage notice">' +
            '    <div class="consent-banner__copy">' +
            '      <strong>Storage and cookie choices</strong>' +
            "      <p>This site stores accessibility and display preferences so the experience stays the way you asked for it. Non-essential categories are optional.</p>" +
            "    </div>" +
            '    <div class="consent-banner__actions">' +
            '      <button class="button button--primary" type="button" data-consent-accept>Accept all</button>' +
            '      <button class="button button--secondary" type="button" data-consent-decline>Decline non-essential</button>' +
            '      <button class="button button--ghost" type="button" data-consent-customise>Customise</button>' +
            "    </div>" +
            "  </div>" +
            "</div>" +
            '<div class="consent-backdrop" data-consent-backdrop hidden></div>' +
            '<div class="consent-modal" data-consent-modal hidden role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">' +
            '  <div class="consent-modal__panel" data-consent-modal-panel>' +
            '    <div class="consent-modal__header">' +
            '      <h2 id="consent-title">Choose what this site can remember</h2>' +
            '      <p id="consent-description">Essential runtime preferences stay on because they hold the accessibility and display settings you actively choose. Everything else is optional.</p>' +
            "    </div>" +
            '    <div class="consent-modal__body">' +
            '      <div class="consent-category-list">' +
            '        <section class="consent-category" aria-labelledby="consent-essential-title">' +
            '          <div class="consent-category__header">' +
            '            <input type="checkbox" id="consent-essential" checked disabled />' +
            '            <div><strong id="consent-essential-title">Essential runtime preferences</strong>' +
            "            <p>Stores the accessibility and display settings you choose.</p></div>" +
            "          </div>" +
            "        </section>" +
            '        <section class="consent-category" aria-labelledby="consent-analytics-title">' +
            '          <div class="consent-category__header">' +
            '            <input type="checkbox" id="consent-analytics" data-consent-field="analytics" />' +
            '            <div><strong id="consent-analytics-title">Analytics and measurement</strong>' +
            "            <p>Anonymous usage measurement if introduced later. No analytics scripts are currently active.</p></div>" +
            "          </div>" +
            "        </section>" +
            '        <section class="consent-category" aria-labelledby="consent-marketing-title">' +
            '          <div class="consent-category__header">' +
            '            <input type="checkbox" id="consent-marketing" data-consent-field="marketing" />' +
            '            <div><strong id="consent-marketing-title">Marketing and third-party tracking</strong>' +
            "            <p>No marketing or tracking scripts are currently active.</p></div>" +
            "          </div>" +
            "        </section>" +
            "      </div>" +
            '      <p class="consent-status" data-consent-status aria-live="polite"></p>' +
            "    </div>" +
            '    <div class="consent-modal__actions">' +
            '      <button class="button button--primary" type="button" data-consent-save>Save preferences</button>' +
            '      <button class="button button--secondary" type="button" data-consent-essential-only>Use essential only</button>' +
            '      <button class="button button--ghost" type="button" data-consent-close>Close</button>' +
            "    </div>" +
            "  </div>" +
            "</div>";

        document.body.appendChild(wrapper);
    }

    function initConsentUi() {
        buildConsentUi();

        var consentBanner         = document.querySelector("[data-consent-banner]");
        var consentBackdrop       = document.querySelector("[data-consent-backdrop]");
        var consentModal          = document.querySelector("[data-consent-modal]");
        var consentModalPanel     = document.querySelector("[data-consent-modal-panel]");
        var consentStatus         = document.querySelector("[data-consent-status]");
        var consentAcceptButton   = document.querySelector("[data-consent-accept]");
        var consentDeclineButton  = document.querySelector("[data-consent-decline]");
        var consentCustomiseButton = document.querySelector("[data-consent-customise]");
        var consentSaveButton     = document.querySelector("[data-consent-save]");
        var consentEssentialOnly  = document.querySelector("[data-consent-essential-only]");
        var consentCloseButton    = document.querySelector("[data-consent-close]");
        var consentManageButtons  = document.querySelectorAll("[data-consent-manage-open]");
        var consentFields = {
            analytics: document.querySelector('[data-consent-field="analytics"]'),
            marketing: document.querySelector('[data-consent-field="marketing"]'),
        };
        var consentState      = readConsentState();
        var consentFocusOrigin = null;

        if (!consentBanner || !consentBackdrop || !consentModal || !consentModalPanel) {
            return;
        }

        function setConsentStatus(message) {
            if (consentStatus) {
                consentStatus.textContent = message || "";
            }
        }

        function syncConsentFields() {
            Object.keys(consentFields).forEach(function syncField(key) {
                if (!consentFields[key]) {
                    return;
                }

                consentFields[key].checked = Boolean(consentState[key]);
            });
        }

        function syncConsentUi() {
            var hasDecision = consentState.decisionMade;
            setElementHidden(consentBanner, hasDecision);

            if (!hasDecision) {
                setConsentStatus("");
            }

            root.dataset.consentAnalytics = consentState.analytics ? "granted" : "denied";
            root.dataset.consentMarketing = consentState.marketing ? "granted" : "denied";
            syncConsentFields();
        }

        function openConsentModal(origin) {
            consentFocusOrigin = origin || document.activeElement;
            setElementHidden(consentBanner, true);
            setElementHidden(consentBackdrop, false);
            setElementHidden(consentModal, false);
            body.dataset.consentOpen = "true";
            syncConsentFields();
            setConsentStatus("Essential runtime preferences stay on. Non-essential categories are optional.");

            if (consentFields.analytics && typeof consentFields.analytics.focus === "function") {
                consentFields.analytics.focus();
            }
        }

        function closeConsentModal(options) {
            var revealBanner  = options && options.revealBanner;
            var restoreFocus  = !options || options.restoreFocus !== false;

            setElementHidden(consentBackdrop, true);
            setElementHidden(consentModal, true);
            delete body.dataset.consentOpen;

            if (!consentState.decisionMade && revealBanner) {
                setElementHidden(consentBanner, false);
            }

            if (restoreFocus && consentFocusOrigin && typeof consentFocusOrigin.focus === "function") {
                consentFocusOrigin.focus();
            }
        }

        function applyConsentDecision(nextState, message) {
            consentState = writeConsentState(nextState);
            setElementHidden(consentBackdrop, true);
            setElementHidden(consentModal, true);
            delete body.dataset.consentOpen;
            syncConsentUi();
            setConsentStatus(message);

            if (consentFocusOrigin && typeof consentFocusOrigin.focus === "function") {
                consentFocusOrigin.focus();
            }
        }

        if (consentAcceptButton) {
            consentAcceptButton.addEventListener("click", function handleAcceptAll() {
                applyConsentDecision(
                    { essential: true, analytics: true, marketing: true, decisionMade: true },
                    "All categories accepted.",
                );
            });
        }

        if (consentDeclineButton) {
            consentDeclineButton.addEventListener("click", function handleDecline() {
                applyConsentDecision(
                    { essential: true, analytics: false, marketing: false, decisionMade: true },
                    "Only essential runtime preferences are active.",
                );
            });
        }

        if (consentCustomiseButton) {
            consentCustomiseButton.addEventListener("click", function handleCustomise() {
                openConsentModal(document.activeElement);
            });
        }

        if (consentSaveButton) {
            consentSaveButton.addEventListener("click", function handleSave() {
                applyConsentDecision(
                    {
                        essential: true,
                        analytics: consentFields.analytics ? consentFields.analytics.checked : false,
                        marketing: consentFields.marketing ? consentFields.marketing.checked : false,
                        decisionMade: true,
                    },
                    "Your storage preferences have been saved.",
                );
            });
        }

        if (consentEssentialOnly) {
            consentEssentialOnly.addEventListener("click", function handleEssentialOnly() {
                applyConsentDecision(
                    { essential: true, analytics: false, marketing: false, decisionMade: true },
                    "Only essential runtime preferences are active.",
                );
            });
        }

        if (consentCloseButton) {
            consentCloseButton.addEventListener("click", function handleConsentClose() {
                closeConsentModal({ restoreFocus: true, revealBanner: !consentState.decisionMade });
            });
        }

        Array.from(consentManageButtons).forEach(function bindManageOpen(button) {
            button.addEventListener("click", function handleManageOpen() {
                openConsentModal(button);
            });
        });

        consentBackdrop.addEventListener("click", function handleBackdrop() {
            closeConsentModal({ restoreFocus: true, revealBanner: !consentState.decisionMade });
        });

        document.addEventListener("keydown", function handleConsentEscape(event) {
            if (event.key === "Escape" && body.dataset.consentOpen === "true") {
                closeConsentModal({ restoreFocus: true, revealBanner: !consentState.decisionMade });
            }
        });

        syncConsentUi();
    }

    /* ============================================================
       SWIPE DISMISS
    ============================================================ */

    function bindSwipeDismiss(element, side, onDismiss) {
        var startX = 0;
        var startY = 0;
        var deltaX = 0;
        var deltaY = 0;

        if (!element) {
            return;
        }

        element.addEventListener("touchstart", function handleTouchStart(event) {
            if (!isMobile() || !event.touches || event.touches.length !== 1) {
                return;
            }

            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            deltaX = 0;
            deltaY = 0;
        }, { passive: true });

        element.addEventListener("touchmove", function handleTouchMove(event) {
            if (!isMobile() || !event.touches || event.touches.length !== 1) {
                return;
            }

            deltaX = event.touches[0].clientX - startX;
            deltaY = event.touches[0].clientY - startY;
        }, { passive: true });

        element.addEventListener("touchend", function handleTouchEnd() {
            var passedDistance  = Math.abs(deltaX) > 72;
            var horizontalIntent = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
            var matchesDirection =
                (side === "left"  && deltaX < 0) ||
                (side === "right" && deltaX > 0);

            if (passedDistance && horizontalIntent && matchesDirection) {
                onDismiss();
            }
        }, { passive: true });
    }

    /* ============================================================
       FORM HANDLING
    ============================================================ */

    if (form) {
        form.addEventListener("input", function handlePreviewInput() {
            engine.updateState(collectFormState(), false);
            syncEngineCapabilityUi();
            syncTalkbackControls();
            setStatus("Changes apply right away. Save them if you want them next time.");
        });

        form.addEventListener("change", function handlePreviewChange() {
            engine.updateState(collectFormState(), false);
            syncEngineCapabilityUi();
            syncTalkbackControls();
            setStatus("Changes apply right away. Save them if you want them next time.");
        });

        form.addEventListener("submit", function handleSubmit(event) {
            event.preventDefault();
            engine.updateState(collectFormState(), true);
            syncEngineCapabilityUi();
            setStatus("These settings have been saved for next time.");
            closeModal({ restoreFocus: true });
        });
    }

    if (saveButton) {
        saveButton.addEventListener("click", function saveSettings(event) {
            event.preventDefault();
            engine.updateState(collectFormState(), true);
            syncEngineCapabilityUi();
            setStatus("These settings have been saved for next time.");
            closeModal({ restoreFocus: true });
        });
    }

    if (resetButton) {
        resetButton.addEventListener("click", function resetSettings() {
            engine.resetState();
            syncEngineCapabilityUi();
            setStatus("Back to the site default.");
        });
    }

    /* ============================================================
       READ-ALOUD CONTROLS
    ============================================================ */

    if (speechPlayButton) {
        speechPlayButton.addEventListener("click", function startSpeech() {
            engine.startReadAloud();
        });
    }

    if (speechPauseButton) {
        speechPauseButton.addEventListener("click", function pauseOrResume() {
            var nextSpeechState = engine.getSpeechState();

            if (!nextSpeechState.speaking) {
                return;
            }

            if (nextSpeechState.paused) {
                engine.resumeReadAloud();
                return;
            }

            engine.pauseReadAloud();
        });
    }

    if (speechStopButton) {
        speechStopButton.addEventListener("click", function stopSpeech() {
            engine.stopReadAloud();
        });
    }

    /* ============================================================
       MOBILE NAVIGATION DRAWER BUILD
    ============================================================ */

    (function buildMobileNavigationDrawer() {
        var navShell         = null;
        var navTop           = null;
        var navMain          = null;
        var closeButtonNode  = null;
        var brandClone       = null;
        var brandMark        = document.querySelector(".brand-mark");

        if (!nav || !navMenu) {
            return;
        }

        if (nav.querySelector("[data-nav-shell]")) {
            navClose                  = nav.querySelector("[data-nav-close]");
            navAccessibilityShortcut  = nav.querySelector("[data-nav-accessibility]");
            return;
        }

        navShell = nav.querySelector(".container") || nav;
        navShell.classList.add("nav-drawer__shell");
        navShell.dataset.navShell = "";

        navTop = document.createElement("div");
        navTop.className = "nav-drawer__top";

        brandClone = document.createElement("div");
        brandClone.className = "nav-drawer__brand";

        if (brandMark) {
            brandClone.appendChild(brandMark.cloneNode(true));
        }

        makeDecorativeCloneSafe(brandClone);

        closeButtonNode = document.createElement("button");
        closeButtonNode.className = "nav-close";
        closeButtonNode.type      = "button";
        closeButtonNode.dataset.navClose = "";
        closeButtonNode.setAttribute("aria-label", "Close navigation");
        closeButtonNode.innerHTML = '<span class="sr-only">Close navigation</span>';

        navTop.appendChild(brandClone);
        navTop.appendChild(closeButtonNode);

        navMain = document.createElement("div");
        navMain.className = "nav-drawer__main";

        navShell.insertBefore(navTop, navMenu);
        navShell.insertBefore(navMain, navMenu);
        navMain.appendChild(navMenu);

        navClose = closeButtonNode;
    })();

    /* ============================================================
       MOBILE DIRECT THEME CHOICES BUILD
    ============================================================ */

    (function buildMobileDirectThemeChoices() {
        var appearanceField = form ? form.querySelector('[name="appearance"]') : null;
        var appearanceStack = appearanceField ? appearanceField.closest(".control-stack") : null;
        var choiceGroup = null;

        if (!appearanceField || !appearanceStack) {
            return;
        }

        if (appearanceStack.querySelector("[data-mobile-direct-choice-group]")) {
            return;
        }

        appearanceStack.classList.add("control-stack--mobile-direct");

        choiceGroup = document.createElement("div");
        choiceGroup.className = "mobile-direct-choice-group";
        choiceGroup.setAttribute("data-mobile-direct-choice-group", "appearance");
        choiceGroup.setAttribute("role", "group");
        choiceGroup.setAttribute("aria-label", "Theme options");

        [
            { value: "default", label: "System" },
            { value: "light",   label: "Light" },
            { value: "dark",    label: "Dark" },
        ].forEach(function buildThemeChoice(option) {
            var button = document.createElement("button");
            button.className = "mobile-direct-choice button button--secondary";
            button.type      = "button";
            button.setAttribute("data-mobile-direct-choice-value", option.value);
            button.setAttribute("aria-pressed", "false");
            button.textContent = option.label;

            button.addEventListener("click", function handleDirectChoice() {
                appearanceField.value = option.value;
                appearanceField.dispatchEvent(new Event("input",  { bubbles: true }));
                appearanceField.dispatchEvent(new Event("change", { bubbles: true }));
                syncMobileDirectChoiceUi();
            });

            choiceGroup.appendChild(button);
        });

        appearanceStack.appendChild(choiceGroup);
    })();

    /* ============================================================
       ACCESSIBILITY MOBILE DRAWER BUILD
    ============================================================ */

    (function buildAccessibilityMobileDrawer() {
        var brandMark    = document.querySelector(".brand-mark");
        var existingPanel = modal ? modal.querySelector(".ac-mobile-panel") : null;

        if (!modal || !modalPanel || !modalContent || !modalHeader || !brandMark || existingPanel) {
            return;
        }

        var panel          = document.createElement("div");
        var shell          = document.createElement("div");
        var top            = document.createElement("div");
        var backButton     = document.createElement("button");
        var brandClone     = document.createElement("div");
        var closeButtonNode = document.createElement("button");
        var menuSlot       = document.createElement("div");
        var contentSlot    = document.createElement("div");
        var actionSlot     = document.createElement("div");

        panel.className = "ac-mobile-panel";
        panel.hidden    = true;

        shell.className = "ac-mobile-shell nav-drawer__shell";

        top.className = "ac-mobile-top nav-drawer__top";

        backButton.className = "ac-mobile-back";
        backButton.type      = "button";
        backButton.dataset.accessibilityBack = "";
        backButton.setAttribute("aria-label", "Go back");
        backButton.setAttribute("aria-disabled", "true");
        backButton.tabIndex = -1;
        backButton.innerHTML =
            '<span class="ac-mobile-back__icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" focusable="false">' +
            '<path d="M14.75 5.5 8.25 12l6.5 6.5-1.5 1.5L5.25 12l8-8z"></path>' +
            "</svg></span>";

        brandClone.className = "ac-mobile-brand nav-drawer__brand";
        brandClone.appendChild(brandMark.cloneNode(true));
        makeDecorativeCloneSafe(brandClone);

        closeButtonNode.className = "ac-mobile-close nav-close";
        closeButtonNode.type      = "button";
        closeButtonNode.dataset.accessibilityClose = "";
        closeButtonNode.setAttribute("aria-label", "Close accessibility settings");

        menuSlot.className = "ac-mobile-menu";

        acMobileBranches.forEach(function buildBranchTrigger(branch) {
            var trigger = document.createElement("button");
            trigger.className = "ac-mobile-menu__button";
            trigger.type      = "button";
            trigger.setAttribute("data-ac-mobile-branch-trigger", branch.id);
            trigger.innerHTML =
                '<span class="ac-mobile-menu__label">' + branch.label + "</span>" +
                '<span class="ac-mobile-menu__chevron" aria-hidden="true">›</span>';

            trigger.addEventListener("click", function handleBranchOpen() {
                setAcMobileBranch(branch.id);
            });

            menuSlot.appendChild(trigger);
        });

        contentSlot.className = "ac-mobile-content";
        actionSlot.className  = "ac-mobile-actions";

        top.appendChild(backButton);
        top.appendChild(brandClone);
        top.appendChild(closeButtonNode);
        shell.appendChild(top);
        shell.appendChild(menuSlot);
        shell.appendChild(contentSlot);
        shell.appendChild(actionSlot);
        panel.appendChild(shell);
        modal.appendChild(panel);

        backButton.addEventListener("click", function handleBranchBack() {
            if (!activeAcMobileBranch) {
                return;
            }

            setAcMobileBranch(null);
        });

        closeButtonNode.addEventListener("click", function handleDrawerClose() {
            closeModal();
        });
    })();

    /* ============================================================
       UI EVENT BINDINGS
    ============================================================ */

    openButtons.forEach(function bindOpen(button) {
        button.addEventListener("click", openModal);
    });

    Array.from(closeButtons).forEach(function bindClose(button) {
        button.addEventListener("click", function handleClose() {
            closeModal();
        });
    });

    if (navToggle) {
        navToggle.addEventListener("click", function toggleNavigation() {
            var isOpen = header && header.dataset.navOpen === "true";

            if (!isOpen && modal && !modal.hidden) {
                closeModal({ restoreFocus: false });
            }

            lastNavFocusedElement = document.activeElement;
            syncNavigationState(!isOpen, { moveFocus: !isOpen, restoreFocus: isOpen });
        });
    }

    if (navClose) {
        navClose.addEventListener("click", function closeNavigation() {
            syncNavigationState(false, { restoreFocus: true });
        });
    }

    if (navAccessibilityShortcut) {
        navAccessibilityShortcut.addEventListener("click", function openAccessibilityFromDrawer() {
            syncNavigationState(false, { restoreFocus: false });
            openModal();
        });
    }

    if (navMenu) {
        Array.from(navMenu.querySelectorAll("a[href]")).forEach(function bindNavLink(link) {
            link.addEventListener("click", function closeDrawerOnLink() {
                syncNavigationState(false);
            });
        });
    }

    if (nav) {
        Array.from(nav.querySelectorAll("[data-nav-dismiss='true']")).forEach(function bindDismiss(link) {
            link.addEventListener("click", function closeDrawerOnDismiss() {
                syncNavigationState(false);
            });
        });
    }

    if (backdrop) {
        backdrop.addEventListener("click", function handleBackdropClick() {
            if (modal && !modal.hidden) {
                closeModal();
                return;
            }

            if (header && header.dataset.navOpen === "true") {
                syncNavigationState(false, { restoreFocus: true });
            }
        });
    }

    document.addEventListener("keydown", function handleKeyboard(event) {
        if (event.key === "Escape" && modal && !modal.hidden) {
            closeModal();
            return;
        }

        if (event.key === "Escape" && header && header.dataset.navOpen === "true") {
            syncNavigationState(false, { restoreFocus: true });
            return;
        }

        trapFocus(event);
    });

    document.addEventListener("click", function handleDrawerTapAway(event) {
        var navShell = null;

        if (!isMobile() || !header || header.dataset.navOpen !== "true") {
            return;
        }

        if (event.target && event.target.closest && event.target.closest("[data-nav-toggle]")) {
            return;
        }

        navShell = nav.querySelector("[data-nav-shell]") || nav;

        if (navShell && navShell.contains(event.target)) {
            return;
        }

        syncNavigationState(false, { restoreFocus: false });
    });

    /* ============================================================
       SWIPE GESTURES
    ============================================================ */

    bindSwipeDismiss(modal, "left", function dismissEngineDrawer() {
        if (modal && !modal.hidden) {
            closeModal();
        }
    });

    bindSwipeDismiss(nav, "right", function dismissNavigationDrawer() {
        if (header && header.dataset.navOpen === "true") {
            syncNavigationState(false, { restoreFocus: true });
        }
    });

    /* ============================================================
       BREAKPOINT HANDLING
    ============================================================ */

    if (mobileQuery) {
        var handleBreakpointChange = function () {
            syncNavigationState(false);
            syncAccessibilityView();
            syncEngineCapabilityUi();
        };

        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", handleBreakpointChange);
        } else if (typeof mobileQuery.addListener === "function") {
            mobileQuery.addListener(handleBreakpointChange);
        }
    }

    /* ============================================================
       TAB PANEL WIDGET (data-platform-explorer)
    ============================================================ */

    function initPlatformExplorer() {
        var explorers = document.querySelectorAll("[data-platform-explorer]");

        explorers.forEach(function (explorer) {
            var tabs   = Array.from(explorer.querySelectorAll("[role='tab']"));
            var panels = Array.from(explorer.querySelectorAll("[role='tabpanel']"));

            function selectTab(tab) {
                tabs.forEach(function (t) {
                    var isSelected = t === tab;
                    t.setAttribute("aria-selected", isSelected ? "true" : "false");
                    t.tabIndex = isSelected ? 0 : -1;
                });

                panels.forEach(function (panel) {
                    if (panel.id === tab.getAttribute("aria-controls")) {
                        panel.removeAttribute("hidden");
                    } else {
                        panel.setAttribute("hidden", "");
                    }
                });

                if (typeof tab.scrollIntoView === "function") {
                    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
                }
            }

            tabs.forEach(function (tab, index) {
                tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;

                tab.addEventListener("click", function () {
                    selectTab(tab);
                });

                tab.addEventListener("keydown", function (e) {
                    var dir = 0;

                    if (e.key === "ArrowRight" || e.key === "ArrowDown") { dir = 1; }
                    if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { dir = -1; }

                    if (e.key === "Home") {
                        selectTab(tabs[0]);
                        tabs[0].focus();
                        return;
                    }

                    if (e.key === "End") {
                        selectTab(tabs[tabs.length - 1]);
                        tabs[tabs.length - 1].focus();
                        return;
                    }

                    if (dir !== 0) {
                        e.preventDefault();
                        var next = tabs[(index + dir + tabs.length) % tabs.length];
                        selectTab(next);
                        next.focus();
                    }
                });
            });
        });
    }

    /* ============================================================
       CONTACT FORM
    ============================================================ */

    function initContactForm() {
        var contactForm = document.querySelector("[data-contact-form]");

        if (!contactForm) {
            return;
        }

        var submitBtn = contactForm.querySelector("[data-contact-submit]");
        var statusEl  = contactForm.querySelector("[data-contact-status]");
        var endpoint  = contactForm.dataset.endpoint || contactForm.getAttribute("action") || "";

        function setContactStatus(state, message) {
            if (!statusEl) {
                return;
            }

            statusEl.textContent   = message;
            statusEl.dataset.state = state;
        }

        function setSubmitting(active) {
            if (!submitBtn) {
                return;
            }

            submitBtn.disabled     = active;
            submitBtn.textContent  = active ? "Sending…" : "Send message";
        }

        function clearFieldError(field) {
            if (!field) {
                return;
            }

            field.removeAttribute("aria-invalid");
            var errorEl = document.getElementById(field.id + "-error");

            if (errorEl) {
                errorEl.textContent = "";
                errorEl.hidden      = true;
            }
        }

        function setFieldError(field, message) {
            if (!field) {
                return;
            }

            field.setAttribute("aria-invalid", "true");
            var errorEl = document.getElementById(field.id + "-error");

            if (errorEl) {
                errorEl.textContent = message;
                errorEl.hidden      = false;
            }
        }

        contactForm.querySelectorAll("input, select, textarea").forEach(function (field) {
            field.addEventListener("input",  function () { clearFieldError(field); });
            field.addEventListener("change", function () { clearFieldError(field); });
        });

        contactForm.addEventListener("submit", function (event) {
            event.preventDefault();

            var honeypot = contactForm.querySelector("[name='websiteUrl']");
            var botcheck = contactForm.querySelector("[name='botcheck']");

            if ((honeypot && honeypot.value) || (botcheck && botcheck.checked)) {
                return;
            }

            contactForm.querySelectorAll("[aria-invalid='true']").forEach(function (el) {
                el.removeAttribute("aria-invalid");
            });

            contactForm.querySelectorAll(".form-error").forEach(function (el) {
                el.textContent = "";
                el.hidden = true;
            });

            setContactStatus("", "");

            var nameInput    = contactForm.querySelector("[name='name']");
            var emailInput   = contactForm.querySelector("[name='email']");
            var purposeInput = contactForm.querySelector("[name='purpose']");
            var messageInput = contactForm.querySelector("[name='message']");
            var consentInput = contactForm.querySelector("[name='consent']");

            var nameVal    = nameInput    ? nameInput.value.trim()    : "";
            var emailVal   = emailInput   ? emailInput.value.trim()   : "";
            var purposeVal = purposeInput ? purposeInput.value        : "";
            var messageVal = messageInput ? messageInput.value.trim() : "";

            var errors          = [];
            var firstErrorField = null;

            if (!nameVal) {
                setFieldError(nameInput, "Please enter your name.");
                errors.push("name");
                if (!firstErrorField) { firstErrorField = nameInput; }
            }

            if (!emailVal) {
                setFieldError(emailInput, "Please enter your email address.");
                errors.push("email");
                if (!firstErrorField) { firstErrorField = emailInput; }
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
                setFieldError(emailInput, "Please enter a valid email address.");
                errors.push("email");
                if (!firstErrorField) { firstErrorField = emailInput; }
            }

            if (!purposeVal) {
                setFieldError(purposeInput, "Please select a reason for contact.");
                errors.push("purpose");
                if (!firstErrorField) { firstErrorField = purposeInput; }
            }

            if (!messageVal) {
                setFieldError(messageInput, "Please describe your enquiry.");
                errors.push("message");
                if (!firstErrorField) { firstErrorField = messageInput; }
            }

            if (consentInput && !consentInput.checked) {
                setFieldError(consentInput, "Please confirm you are happy for us to use this information to respond.");
                errors.push("consent");
                if (!firstErrorField) { firstErrorField = consentInput; }
            }

            if (errors.length > 0) {
                setContactStatus("error", errors.length === 1
                    ? "Please fix the error above before sending."
                    : "Please fix " + errors.length + " errors above before sending.");

                if (firstErrorField) {
                    firstErrorField.focus();
                }

                return;
            }

            var formData = new window.FormData(contactForm);
            var data     = Object.fromEntries(formData.entries());
            data.name    = nameVal;
            data.email   = emailVal;
            data.replyto = emailVal;
            data.purpose = purposeVal;
            data.message = messageVal;
            data.consent = consentInput && consentInput.checked ? "yes" : "no";

            setSubmitting(true);
            setContactStatus("ready", "Sending your message…");

            fetch(endpoint, {
                method:  "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body:    JSON.stringify(data),
            })
                .then(function (response) {
                    return response
                        .json()
                        .catch(function () {
                            return { success: false, message: "Unexpected response from form service." };
                        })
                        .then(function (result) {
                            return { ok: response.ok, status: response.status, result: result };
                        });
                })
                .then(function (payload) {
                    var result  = payload && payload.result ? payload.result : {};
                    var success = result && (result.success === true || result.success === "true");
                    var message = (result && result.message) || (result && result.error) || "";

                    if (!payload.ok || !success) {
                        throw new Error(message || "Something went wrong.");
                    }

                    setContactStatus("success", message || "Message sent. We will come back to you soon.");
                    contactForm.reset();
                    setSubmitting(false);
                })
                .catch(function (error) {
                    setContactStatus("error", (error && error.message) || "Something went wrong — please try again or get in touch directly.");
                    setSubmitting(false);
                });
        });
    }

    /* ============================================================
       INIT
    ============================================================ */

    syncNavigationState(false);
    initConsentUi();
    syncAccessibilityView();
    syncEngineCapabilityUi();
    engine.subscribeSpeech(syncSpeechUi);
    initPlatformExplorer();
    initContactForm();

})();
