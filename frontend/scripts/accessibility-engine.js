/*
 * File: frontend/scripts/accessibility-engine.js
 * Project: Access for All Engine Starter
 *
 * Purpose: Runtime accessibility engine — manages all engine axes, persists
 *          state to localStorage (v5), syncs root data-* attributes and
 *          CSS custom property tokens, drives talkback and reading guide.
 *
 * Engine axes:
 *   appearance (light/dark/auto), palette (9 palettes), contrast (11 steps),
 *   font, fontScale, lineSpacing, paragraphSpacing, letterSpacing, wordSpacing,
 *   boldText, motion, depth, transparency, focusBoost, underlineLinks,
 *   tint, filterStrength, readingMode, landmark (redesigned),
 *   readingGuide, talkbackMode, speechRate, dimMedia
 *
 * Data-attribute contract (all on <html>):
 *   data-theme, data-appearance, data-palette, data-contrast, data-depth,
 *   data-font, data-tint, data-filter-strength, data-reader, data-guide,
 *   data-talkback, data-bold, data-motion, data-transparency, data-focus,
 *   data-links, data-landmark, data-media, data-spacing
 *
 * CSS token namespace: --gm-*
 * Public API: window.accessibilityEngine
 *
 * Load order: this file before site-ui.js
 */

(function accessibilityEngineBootstrap() {
    /* ============================================================
       CONFIG
    ============================================================ */

    var storageKey        = "gm-accessibility-state";
    var storageVersionKey = "gm-accessibility-version";
    var storageVersion    = "5";

    var root = document.documentElement;
    var body = document.body;
    var main =
        document.getElementById("main-content") ||
        document.querySelector("main");

    var subscribers       = [];
    var speechSubscribers = [];

    var systemDarkQuery =
        window.matchMedia && typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-color-scheme: dark)")
            : null;

    var speechApi =
        "speechSynthesis" in window ? window.speechSynthesis : null;

    var finePointerQuery =
        window.matchMedia && typeof window.matchMedia === "function"
            ? window.matchMedia("(hover: hover) and (pointer: fine)")
            : null;

    var isAppleMobilePlatform =
        /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
        (navigator.platform === "MacIntel" &&
            Number(navigator.maxTouchPoints || 0) > 1);

    var speechVoices = [];

    /* Reading guide height steps */
    var guideHeights = {
        off: "0rem",
        "1": "3.5rem",
        "3": "7.25rem",
        "5": "10.75rem",
    };

    /* ── Allowed value lists ── */
    var allowedAppearances    = ["default", "light", "dark"];
    var allowedPalettes       = ["default", "monochrome", "blue", "aqua", "green", "yellow", "red", "orange", "purple", "pink"];
    var allowedContrasts      = ["minus-5", "minus-4", "minus-3", "minus-2", "minus-1", "default", "plus-1", "plus-2", "plus-3", "plus-4", "plus-5"];
    var allowedDepths         = ["default", "reduced", "off"];
    var allowedFonts          = ["default", "legible", "dyslexia", "system"];
    var allowedTints          = ["default", "warm", "cool", "soft", "monochrome", "dim", "bright"];
    var allowedFilterStrengths = ["default", "low", "medium", "high"];
    var allowedReadingModes   = ["default", "focused"];
    var allowedReadingGuides  = ["off", "1", "3", "5"];
    var allowedTalkbackModes  = ["off", "focus", "hover", "both"];
    var allowedSpeechRates    = [85, 100, 115, 130];
    var allowedTransparencyLevels = ["default", "reduced", "off"];
    var allowedMotionLevels   = ["default", "reduced", "off"];
    var allowedSupportLevels  = ["default", "medium", "high"];
    var allowedBoldLevels     = ["default", "level-1", "level-2", "level-3", "level-4"];
    /* Landmark axis: redesigned single control (off/soft/clear)
       off   — no visual markers
       soft  — quiet left border stripe on each [data-accessibility-region]
       clear — stripe + dashed outline (uses CSS outline, zero layout shift) */
    var allowedLandmarks      = ["off", "soft", "clear"];

    var defaults = {
        appearance:       "default",
        palette:          "default",
        contrast:         "default",
        depth:            "default",
        font:             "default",
        tint:             "default",
        filterStrength:   "default",
        readingMode:      "default",
        readingGuide:     "off",
        talkbackMode:     "off",
        speechRate:       100,
        fontScale:        100,
        lineSpacing:      100,
        paragraphSpacing: 100,
        letterSpacing:    0,
        wordSpacing:      0,
        boldText:         "default",
        motion:           "default",
        transparency:     "default",
        focusBoost:       "default",
        underlineLinks:   "default",
        landmark:         "off",
        dimMedia:         "default",
    };

    var speechState = {
        supported: Boolean(speechApi),
        speaking:  false,
        paused:    false,
        source:    "idle",
        label:     speechApi
            ? "Talkback is ready when you want it."
            : "Talkback is not available in this browser.",
    };

    var speechQueue       = [];
    var speechIndex       = 0;
    var currentUtterance  = null;
    var currentSpeechNode = null;
    var speechSession     = 0;
    var speechMode        = "idle";
    var guideElement      = null;
    var guideY            = window.innerHeight * 0.42;
    var hoverSpeechTimeout = 0;
    var lastTalkbackNode  = null;
    var talkbackScopeRoot = null;

    /* ============================================================
       UTILITY HELPERS
    ============================================================ */

    function clampRange(value, minimum, maximum, step, fallback) {
        var numericValue = Number(value);

        if (Number.isNaN(numericValue)) {
            return fallback;
        }

        return Math.min(
            maximum,
            Math.max(minimum, Math.round(numericValue / step) * step),
        );
    }

    function normalizeChoice(value, allowedValues, fallback) {
        return allowedValues.indexOf(value) >= 0 ? value : fallback;
    }

    function normalizeNumberChoice(value, allowedValues, fallback) {
        var numericValue = Number(value);

        return allowedValues.indexOf(numericValue) >= 0 ? numericValue : fallback;
    }

    function slugify(value, fallback) {
        var slug = String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        return slug || fallback;
    }

    /* ── Storage ── */

    function readStorage() {
        try {
            if (window.localStorage.getItem(storageVersionKey) !== storageVersion) {
                window.localStorage.removeItem(storageKey);
                window.localStorage.setItem(storageVersionKey, storageVersion);
                return null;
            }

            return window.localStorage.getItem(storageKey);
        } catch (error) {
            return null;
        }
    }

    function writeStorage(nextState) {
        try {
            window.localStorage.setItem(storageVersionKey, storageVersion);
            window.localStorage.setItem(storageKey, JSON.stringify(nextState));
        } catch (error) {
            return;
        }
    }

    /* ── Theme resolution ── */

    function getEffectiveTheme(nextState) {
        if (nextState.appearance === "light") {
            return "light";
        }

        if (nextState.appearance === "dark") {
            return "dark";
        }

        if (systemDarkQuery && systemDarkQuery.matches) {
            return "dark";
        }

        return "light";
    }

    /* ── State normalisation ── */

    function normalizeState(rawState) {
        var nextState = rawState || {};

        function normalizeSupportLevel(value, fallback) {
            if (typeof value === "boolean") {
                return value ? "medium" : "default";
            }

            return normalizeChoice(value, allowedSupportLevels, fallback);
        }

        return {
            appearance:       normalizeChoice(nextState.appearance, allowedAppearances, defaults.appearance),
            palette:          normalizeChoice(nextState.palette, allowedPalettes, defaults.palette),
            contrast:         normalizeChoice(nextState.contrast, allowedContrasts, defaults.contrast),
            depth:            normalizeChoice(nextState.depth, allowedDepths, defaults.depth),
            font:             normalizeChoice(nextState.font, allowedFonts, defaults.font),
            tint:             normalizeChoice(nextState.tint, allowedTints, defaults.tint),
            filterStrength:   normalizeChoice(nextState.filterStrength, allowedFilterStrengths, defaults.filterStrength),
            readingMode:      normalizeChoice(nextState.readingMode, allowedReadingModes, defaults.readingMode),
            readingGuide:     normalizeChoice(nextState.readingGuide, allowedReadingGuides, defaults.readingGuide),
            talkbackMode:     normalizeChoice(nextState.talkbackMode, allowedTalkbackModes, defaults.talkbackMode),
            speechRate:       normalizeNumberChoice(nextState.speechRate, allowedSpeechRates, defaults.speechRate),
            fontScale:        clampRange(nextState.fontScale, 90, 160, 5, defaults.fontScale),
            lineSpacing:      clampRange(nextState.lineSpacing, 80, 180, 5, defaults.lineSpacing),
            paragraphSpacing: clampRange(nextState.paragraphSpacing, 80, 180, 5, defaults.paragraphSpacing),
            letterSpacing:    clampRange(nextState.letterSpacing, -8, 12, 1, defaults.letterSpacing),
            wordSpacing:      clampRange(nextState.wordSpacing, -10, 14, 1, defaults.wordSpacing),
            boldText:         normalizeChoice(nextState.boldText, allowedBoldLevels, defaults.boldText),
            motion:           normalizeChoice(nextState.motion, allowedMotionLevels, defaults.motion),
            transparency:     normalizeChoice(nextState.transparency, allowedTransparencyLevels, defaults.transparency),
            focusBoost:       normalizeSupportLevel(nextState.focusBoost, defaults.focusBoost),
            underlineLinks:   normalizeSupportLevel(nextState.underlineLinks, defaults.underlineLinks),
            landmark:         normalizeChoice(nextState.landmark, allowedLandmarks, defaults.landmark),
            dimMedia:         normalizeSupportLevel(nextState.dimMedia, defaults.dimMedia),
        };
    }

    function loadState() {
        var stored = readStorage();

        if (!stored) {
            return { ...defaults };
        }

        try {
            return normalizeState({ ...defaults, ...JSON.parse(stored) });
        } catch (error) {
            return { ...defaults };
        }
    }

    /* ============================================================
       REGION MAP
    ============================================================ */

    function ensureElementId(element, fallbackPrefix, index) {
        if (!element) {
            return "";
        }

        if (element.id) {
            return element.id;
        }

        var heading =
            element.querySelector &&
            element.querySelector("h1, h2, h3, legend, [data-region-label]");
        var sourceText =
            element.getAttribute("aria-label") ||
            element.getAttribute("data-region-label") ||
            (heading ? heading.textContent : "");
        var fallback = fallbackPrefix + "-" + String(index + 1);
        var nextId = slugify(sourceText, fallback);

        element.id = nextId;
        return nextId;
    }

    function resolveRegionLabel(element, index) {
        if (!element) {
            return "";
        }

        var explicitLabel =
            element.getAttribute("aria-label") ||
            element.getAttribute("data-region-label");

        if (explicitLabel) {
            return explicitLabel;
        }

        var heading =
            element.querySelector &&
            element.querySelector("h1, h2, h3, legend, .eyebrow");

        if (heading && heading.textContent.trim()) {
            return heading.textContent.trim();
        }

        if (element.tagName === "HEADER") {
            return "Site header";
        }

        if (element.tagName === "NAV") {
            return "Navigation";
        }

        if (element.tagName === "MAIN") {
            return "Main content";
        }

        if (element.tagName === "FOOTER") {
            return "Site footer";
        }

        return "Section " + String(index + 1);
    }

    /* annotateRegions — walks all landmark and section elements, ensures each
       has a stable id and data-accessibility-region label. CSS uses this
       attribute to apply the landmark stripe and outline in soft/clear modes. */
    function annotateRegions() {
        var regionIndex = 0;
        var regions = document.querySelectorAll(
            ".site-header, .primary-nav, main, main section, main article, main aside, .site-footer",
        );

        regions.forEach(function annotateRegion(region) {
            var label = resolveRegionLabel(region, regionIndex);
            ensureElementId(region, "region", regionIndex);
            region.setAttribute("data-accessibility-region", label);
            regionIndex += 1;
        });
    }

    function getPageMap() {
        var items = [];
        var landmarkTargets = [
            document.querySelector(".site-header"),
            document.querySelector(".primary-nav"),
            main,
            document.querySelector(".site-footer"),
        ].filter(Boolean);

        landmarkTargets.forEach(function pushLandmark(target, index) {
            items.push({
                id:    ensureElementId(target, "landmark", index),
                label: resolveRegionLabel(target, index),
                kind:  "landmark",
                level: 0,
            });
        });

        if (!main) {
            return items;
        }

        Array.from(main.querySelectorAll("h1, h2, h3")).forEach(
            function pushHeading(heading, index) {
                var level = Number(heading.tagName.replace("H", ""));
                items.push({
                    id:    ensureElementId(heading, "heading", index),
                    label: heading.textContent.trim(),
                    kind:  "heading",
                    level: level,
                });
            },
        );

        return items;
    }

    function jumpTo(targetId) {
        var target = document.getElementById(targetId);

        if (!target) {
            return false;
        }

        target.setAttribute("tabindex", "-1");
        target.scrollIntoView({
            behavior: root.dataset.motion === "reduced" ? "auto" : "smooth",
            block: "start",
        });
        window.setTimeout(function focusTarget() {
            target.focus({ preventScroll: true });
        }, 120);
        return true;
    }

    /* ============================================================
       READING GUIDE
    ============================================================ */

    function ensureGuideLayer() {
        if (guideElement) {
            return guideElement;
        }

        guideElement = document.createElement("div");
        guideElement.className = "accessibility-reading-guide";
        guideElement.setAttribute("aria-hidden", "true");
        body.appendChild(guideElement);
        return guideElement;
    }

    function moveGuide(nextY) {
        if (!guideElement) {
            return;
        }

        guideY = Math.max(72, Math.min(window.innerHeight - 72, nextY));
        guideElement.style.top = String(guideY) + "px";
    }

    function updateGuideLayer(nextState) {
        ensureGuideLayer();
        root.style.setProperty(
            "--reading-guide-height",
            guideHeights[nextState.readingGuide] || guideHeights.off,
        );

        if (nextState.readingGuide === "off") {
            delete body.dataset.readingGuideActive;
            guideElement.hidden = true;
            return;
        }

        body.dataset.readingGuideActive = "true";
        guideElement.hidden = false;
        moveGuide(guideY);
    }

    function handleGuidePointer(event) {
        var point = null;

        if (!state || state.readingGuide === "off") {
            return;
        }

        if (body.dataset.modalOpen === "true" || body.dataset.drawerOpen === "true") {
            return;
        }

        if (event.touches && event.touches[0]) {
            point = event.touches[0];
        } else if (typeof event.clientY === "number") {
            point = event;
        }

        if (!point) {
            return;
        }

        moveGuide(point.clientY);
    }

    /* ============================================================
       TALKBACK AND PAGE READING
    ============================================================ */

    function notifySpeechSubscribers() {
        speechSubscribers.forEach(function notify(listener) {
            listener({
                supported: speechState.supported,
                speaking:  speechState.speaking,
                paused:    speechState.paused,
                source:    speechState.source,
                label:     speechState.label,
            });
        });
    }

    function setSpeechState(partialState) {
        speechState = {
            supported: speechState.supported,
            speaking: typeof partialState.speaking === "boolean"
                ? partialState.speaking
                : speechState.speaking,
            paused: typeof partialState.paused === "boolean"
                ? partialState.paused
                : speechState.paused,
            source: partialState.source || speechState.source,
            label:  partialState.label  || speechState.label,
        };
        notifySpeechSubscribers();
    }

    function clearSpeechHighlight() {
        if (!currentSpeechNode) {
            return;
        }

        currentSpeechNode.classList.remove("is-speaking");
        currentSpeechNode = null;
    }

    function markSpeechNode(node, options) {
        var settings = options || {};

        clearSpeechHighlight();

        if (!node) {
            return;
        }

        currentSpeechNode = node;
        currentSpeechNode.classList.add("is-speaking");

        if (settings.scrollIntoView === false) {
            return;
        }

        currentSpeechNode.scrollIntoView({
            behavior: root.dataset.motion === "reduced" ? "auto" : "smooth",
            block: talkbackScopeRoot && talkbackScopeRoot.contains(currentSpeechNode)
                ? "nearest"
                : "center",
            inline: "nearest",
        });
    }

    function getReadableNodes(scopeRoot) {
        var readableRoot = scopeRoot instanceof Element ? scopeRoot : main;

        if (!readableRoot) {
            return [];
        }

        return Array.from(
            readableRoot.querySelectorAll(
                "h1, h2, h3, p, li, blockquote, figcaption, legend, .control-stack > span, .control-group__description, .engine-note, .engine-form__status",
            ),
        ).filter(function filterReadableNode(node) {
            if (!node || !node.textContent) {
                return false;
            }

            if (!scopeRoot && node.closest(".accessibility-modal")) {
                return false;
            }

            return node.textContent.trim().length > 0;
        });
    }

    function normalizeSpeechText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function getBaseLanguage(languageCode) {
        return String(languageCode || "").toLowerCase().split("-")[0];
    }

    function getPreferredVoiceLanguages() {
        var htmlLanguage =
            document.documentElement &&
            document.documentElement.getAttribute("lang");
        var browserLanguages = Array.isArray(navigator.languages)
            ? navigator.languages
            : [navigator.language || "en-GB"];

        return [htmlLanguage]
            .concat(browserLanguages)
            .filter(Boolean)
            .map(function normalizeLanguage(language) {
                return String(language).toLowerCase();
            });
    }

    function cacheSpeechVoices() {
        if (!speechApi || typeof speechApi.getVoices !== "function") {
            speechVoices = [];
            return speechVoices;
        }

        speechVoices = speechApi.getVoices() || [];
        return speechVoices;
    }

    function scoreSpeechVoice(voice, preferredLanguages) {
        var score = 0;
        var voiceLanguage = String(voice.lang || "").toLowerCase();
        var voiceBaseLanguage = getBaseLanguage(voiceLanguage);
        var voiceName = String(voice.name || "").toLowerCase();
        var hasPreferredLanguage = preferredLanguages.some(function matchLanguage(language) {
            return voiceLanguage === language;
        });
        var hasPreferredBaseLanguage = preferredLanguages.some(function matchBaseLanguage(language) {
            return getBaseLanguage(language) === voiceBaseLanguage;
        });

        if (hasPreferredLanguage) {
            score += 40;
        } else if (hasPreferredBaseLanguage) {
            score += 28;
        }

        if (voice.default)       { score += 16; }
        if (voice.localService)  { score += 10; }

        if (
            voiceName.indexOf("natural")  >= 0 ||
            voiceName.indexOf("neural")   >= 0 ||
            voiceName.indexOf("enhanced") >= 0 ||
            voiceName.indexOf("premium")  >= 0 ||
            voiceName.indexOf("siri")     >= 0
        ) {
            score += 8;
        }

        if (
            voiceName.indexOf("compact") >= 0 ||
            voiceName.indexOf("espeak")  >= 0 ||
            voiceName.indexOf("robot")   >= 0
        ) {
            score -= 10;
        }

        return score;
    }

    function getPreferredSpeechVoice() {
        var voices = speechVoices.length ? speechVoices : cacheSpeechVoices();
        var preferredLanguages = getPreferredVoiceLanguages();

        if (!voices.length) {
            return null;
        }

        return voices
            .slice()
            .sort(function sortVoices(a, b) {
                return scoreSpeechVoice(b, preferredLanguages) - scoreSpeechVoice(a, preferredLanguages);
            })[0];
    }

    function configureUtterance(utterance) {
        if (!utterance) {
            return utterance;
        }

        var preferredVoice = getPreferredSpeechVoice();
        utterance.rate  = state.speechRate / 100;
        utterance.pitch = 1;
        utterance.lang  =
            (document.documentElement && document.documentElement.getAttribute("lang")) ||
            navigator.language ||
            "en-GB";

        if (preferredVoice) {
            utterance.voice = preferredVoice;
            utterance.lang  = preferredVoice.lang || utterance.lang;
        }

        return utterance;
    }

    function getLabelledByText(node) {
        var labelledBy = node && node.getAttribute("aria-labelledby");

        if (!labelledBy) {
            return "";
        }

        return normalizeSpeechText(
            labelledBy
                .split(/\s+/)
                .map(function readLabel(id) {
                    var labelNode = document.getElementById(id);
                    return labelNode ? labelNode.textContent : "";
                })
                .join(" "),
        );
    }

    function getNodeLabelText(node) {
        function readLabelCopy(label, targetNode) {
            if (!label) {
                return "";
            }

            var clone = label.cloneNode(true);
            clone.querySelectorAll("select, input, textarea, button, small, svg").forEach(function removeNonLabelContent(element) {
                element.remove();
            });

            if (targetNode && targetNode.id) {
                clone.querySelectorAll('[for="' + targetNode.id + '"]').forEach(function removeNestedLabel(element) {
                    element.remove();
                });
            }

            return normalizeSpeechText(clone.textContent);
        }

        if (!node) {
            return "";
        }

        if (node.labels && node.labels.length) {
            return normalizeSpeechText(
                Array.from(node.labels)
                    .map(function readLabel(label) {
                        return readLabelCopy(label, node);
                    })
                    .join(" "),
            );
        }

        if (node.id) {
            var linkedLabel = document.querySelector('label[for="' + node.id + '"]');

            if (linkedLabel) {
                return normalizeSpeechText(linkedLabel.textContent);
            }
        }

        return "";
    }

    function getControlHintText(node) {
        if (!node || !(node instanceof Element)) {
            return "";
        }

        var stack = node.closest(".control-stack");
        var hint  = stack ? stack.querySelector("small") : null;

        return normalizeSpeechText(hint ? hint.textContent : "");
    }

    function getImageSpeechText(node) {
        if (!node) {
            return "";
        }

        var figure     = node.closest("figure");
        var figcaption = figure ? figure.querySelector("figcaption") : null;

        return (
            normalizeSpeechText(node.getAttribute("data-speech-description")) ||
            normalizeSpeechText(node.getAttribute("aria-description"))        ||
            normalizeSpeechText(node.getAttribute("data-image-description"))  ||
            normalizeSpeechText(node.getAttribute("alt"))                     ||
            normalizeSpeechText(figcaption ? figcaption.textContent : "")     ||
            ""
        );
    }

    function describeNodeForSpeech(node, options) {
        var settings = options || {};

        if (!node) {
            return "";
        }

        var tag = (node.tagName || "").toLowerCase();
        var explicitText =
            normalizeSpeechText(node.getAttribute("data-speech-label"))       ||
            normalizeSpeechText(node.getAttribute("data-speech-description")) ||
            normalizeSpeechText(node.getAttribute("aria-label"))              ||
            getLabelledByText(node)                                           ||
            getNodeLabelText(node);
        var text =
            explicitText ||
            (tag === "img"
                ? getImageSpeechText(node)
                : "") ||
            ((tag === "input" || tag === "textarea")
                ? normalizeSpeechText(node.getAttribute("placeholder"))
                : "") ||
            ((tag === "input" && node.type !== "checkbox" && node.type !== "radio")
                ? normalizeSpeechText(node.value)
                : "") ||
            normalizeSpeechText(node.textContent);

        if (!text) {
            return "";
        }

        if (tag === "button")             { return text + ", button"; }
        if (tag === "a")                  { return text + ", link"; }
        if (tag === "textarea")           { return text + ", text area"; }
        if (/^h[1-6]$/.test(tag))        { return text + ", heading"; }
        if (tag === "img")                { return text + ", image"; }

        if (tag === "select") {
            var selectedOption =
                node.options && node.options[node.selectedIndex]
                    ? normalizeSpeechText(node.options[node.selectedIndex].textContent)
                    : "";

            if (settings.optionOnly) {
                return selectedOption ? selectedOption + ", option" : text + ", list";
            }

            return selectedOption
                ? settings.includeSelectValue
                    ? text + ", list, current option " + selectedOption
                    : text + ". " + getControlHintText(node)
                : text + ", list";
        }

        if (tag === "input") {
            if (node.type === "checkbox") {
                return text + ", checkbox, " + (node.checked ? "on" : "off");
            }

            if (node.type === "radio") {
                return text + ", radio button, " + (node.checked ? "selected" : "not selected");
            }

            return text + ", field";
        }

        return text;
    }

    var focusTalkbackSelector =
        'button, a, input, select, textarea, summary, label, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex], h1, h2, h3, p, li, blockquote, figcaption, img';

    var pointerTalkbackSelector =
        'button, a, input, select, textarea, summary, label, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex], h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, img, legend, dt, dd';

    function getTalkbackTarget(node) {
        if (!node || !(node instanceof Element)) {
            return null;
        }

        if (talkbackScopeRoot) {
            if (!talkbackScopeRoot.contains(node)) {
                return null;
            }
        } else if (node.closest(".accessibility-modal")) {
            return null;
        }

        return node.closest(focusTalkbackSelector);
    }

    function isHiddenFromTalkback(node) {
        if (!node || !(node instanceof Element)) {
            return true;
        }

        if (node.hidden || node.getAttribute("aria-hidden") === "true") {
            return true;
        }

        if (node.getAttribute("tabindex") === "-1") {
            return true;
        }

        if (node.closest("[hidden], .visually-hidden, .hidden")) {
            return true;
        }

        return false;
    }

    function getPointerTalkbackTarget(node, point) {
        var stack     = [];
        var candidate = null;

        if (!node || !(node instanceof Element)) {
            return null;
        }

        if (talkbackScopeRoot) {
            if (!talkbackScopeRoot.contains(node)) {
                return null;
            }
        } else if (node.closest(".accessibility-modal")) {
            return null;
        }

        if (
            point &&
            typeof point.clientX === "number" &&
            typeof point.clientY === "number" &&
            typeof document.elementsFromPoint === "function"
        ) {
            stack = document.elementsFromPoint(point.clientX, point.clientY);
        }

        if (!stack.length) {
            stack = [node];
        }

        for (var index = 0; index < stack.length; index += 1) {
            candidate = stack[index];

            if (!candidate || !(candidate instanceof Element)) {
                continue;
            }

            if (talkbackScopeRoot) {
                if (!talkbackScopeRoot.contains(candidate)) {
                    continue;
                }
            } else if (candidate.closest(".accessibility-modal")) {
                continue;
            }

            candidate = candidate.closest(pointerTalkbackSelector);

            if (!candidate || isHiddenFromTalkback(candidate)) {
                continue;
            }

            return candidate;
        }

        return null;
    }

    function shouldUseFocusTalkback()         { return state.talkbackMode === "focus" || state.talkbackMode === "both"; }
    function shouldUseHoverTalkback()         { return state.talkbackMode === "hover" || state.talkbackMode === "both"; }
    function shouldUseScopedTalkback(node)    { return Boolean(talkbackScopeRoot && node instanceof Element && talkbackScopeRoot.contains(node)); }

    function canUsePointerTalkback() {
        if (finePointerQuery) {
            return finePointerQuery.matches;
        }

        return (navigator.maxTouchPoints || 0) === 0;
    }

    function clearHoverTalkbackTimer() {
        if (!hoverSpeechTimeout) {
            return;
        }

        window.clearTimeout(hoverSpeechTimeout);
        hoverSpeechTimeout = 0;
    }

    function clearTalkbackTarget() {
        lastTalkbackNode = null;
        clearHoverTalkbackTimer();
    }

    function getTalkbackDelay(target, trigger) {
        if (trigger === "focus" && shouldUseScopedTalkback(target)) {
            return 0;
        }

        if (trigger === "focus") {
            return 72;
        }

        return 240;
    }

    function queueLiveTargetSpeech(node, trigger, options) {
        var target =
            trigger === "pointer"
                ? getPointerTalkbackTarget(node)
                : getTalkbackTarget(node);
        var settings = options || {};

        if (!speechApi || !target || speechMode === "page") {
            return;
        }

        if (
            target === lastTalkbackNode &&
            (speechState.speaking || speechApi.pending || speechApi.speaking)
        ) {
            return;
        }

        if (settings.immediate) {
            clearHoverTalkbackTimer();
            speakLiveTarget(target, trigger, settings);
            return;
        }

        clearHoverTalkbackTimer();
        hoverSpeechTimeout = window.setTimeout(function triggerQueuedSpeech() {
            speakLiveTarget(target, trigger, settings);
        }, getTalkbackDelay(target, trigger));
    }

    function activateScopedTalkback(scopeRoot) {
        talkbackScopeRoot = scopeRoot instanceof Element ? scopeRoot : null;
        clearTalkbackTarget();

        if (state.talkbackMode === "off") {
            return;
        }

        if (!speechApi || speechState.source === "page") {
            return;
        }

        if (speechMode === "live") {
            stopReadAloud("Talkback is active in this panel.");
            return;
        }

        setSpeechState({
            speaking: false,
            paused:   false,
            source:   "idle",
            label:    "Talkback is active in this panel and across the page.",
        });
    }

    function deactivateScopedTalkback() {
        talkbackScopeRoot = null;
        clearTalkbackTarget();

        if (!speechApi || speechState.source === "page") {
            return;
        }

        if (speechMode === "live") {
            stopReadAloud(
                state.talkbackMode === "off"
                    ? "Talkback is ready when you want it."
                    : "Talkback stays available across the page.",
            );
            return;
        }

        setSpeechState({
            speaking: false,
            paused:   false,
            source:   "idle",
            label:    state.talkbackMode === "off"
                ? "Talkback is ready when you want it."
                : "Talkback stays available across the page.",
        });
    }

    function speakLiveTarget(node, trigger, options) {
        var target =
            trigger === "pointer"
                ? getPointerTalkbackTarget(node)
                : getTalkbackTarget(node);
        var spokenText   = describeNodeForSpeech(target, options);
        var activeSession = 0;

        if (!speechApi || !target || !spokenText || speechMode === "page") {
            return;
        }

        if (target === lastTalkbackNode) {
            return;
        }

        lastTalkbackNode = target;
        clearSpeechHighlight();
        speechSession += 1;
        activeSession  = speechSession;
        speechMode     = "live";
        speechQueue    = [];
        speechIndex    = 0;

        if (speechApi.speaking || speechApi.pending) {
            speechApi.cancel();
        }

        currentUtterance = configureUtterance(new SpeechSynthesisUtterance(spokenText));

        currentUtterance.onstart = function handleLiveSpeechStart() {
            if (activeSession !== speechSession) {
                return;
            }

            markSpeechNode(target, { scrollIntoView: trigger !== "pointer" });
            setSpeechState({
                speaking: true,
                paused:   false,
                source:   "live",
                label:    trigger === "focus"
                    ? "Talkback is reading the current item."
                    : "Talkback is reading under the pointer.",
            });
        };

        currentUtterance.onend = function handleLiveSpeechEnd() {
            if (activeSession !== speechSession) {
                return;
            }

            currentUtterance = null;
            speechMode       = "idle";
            clearSpeechHighlight();
            setSpeechState({
                speaking: false,
                paused:   false,
                source:   "idle",
                label:    "Talkback is ready when you want it.",
            });
        };

        currentUtterance.onerror = function handleLiveSpeechError() {
            if (activeSession !== speechSession) {
                return;
            }

            currentUtterance = null;
            speechMode       = "idle";
            clearSpeechHighlight();
            setSpeechState({
                speaking: false,
                paused:   false,
                source:   "idle",
                label:    "Talkback could not read that item.",
            });
        };

        speechApi.speak(currentUtterance);
    }

    function speakNextBlock() {
        var nextNode      = speechQueue[speechIndex];
        var activeSession = speechSession;

        if (!speechApi) {
            setSpeechState({ speaking: false, paused: false, source: "idle", label: "Talkback is not available in this browser." });
            return;
        }

        if (!nextNode) {
            clearSpeechHighlight();
            currentUtterance = null;
            setSpeechState({ speaking: false, paused: false, source: "idle", label: "Reached the end of the page." });
            return;
        }

        currentUtterance = configureUtterance(new SpeechSynthesisUtterance(nextNode.textContent.trim()));

        currentUtterance.onstart = function handleSpeechStart() {
            if (activeSession !== speechSession) {
                return;
            }

            markSpeechNode(nextNode);
            setSpeechState({ speaking: true, paused: false, source: "page", label: "Reading this page aloud." });
        };

        currentUtterance.onend = function handleSpeechEnd() {
            if (activeSession !== speechSession) {
                return;
            }

            speechIndex += 1;
            speakNextBlock();
        };

        currentUtterance.onerror = function handleSpeechError() {
            if (activeSession !== speechSession) {
                return;
            }

            speechIndex += 1;

            if (speechIndex < speechQueue.length) {
                speakNextBlock();
                return;
            }

            clearSpeechHighlight();
            setSpeechState({ speaking: false, paused: false, source: "idle", label: "Talkback stopped before the end of the page." });
        };

        speechApi.speak(currentUtterance);
    }

    function stopReadAloud(nextLabel) {
        speechSession   += 1;
        speechMode       = "idle";

        if (speechApi) {
            speechApi.cancel();
        }

        speechQueue      = [];
        speechIndex      = 0;
        currentUtterance = null;
        clearSpeechHighlight();
        setSpeechState({ speaking: false, paused: false, source: "idle", label: nextLabel || "Talkback stopped." });
    }

    function startReadAloud() {
        if (!speechApi) {
            setSpeechState({ speaking: false, paused: false, source: "idle", label: "Talkback is not available in this browser." });
            return;
        }

        speechQueue = getReadableNodes(talkbackScopeRoot);
        speechIndex = 0;

        if (speechQueue.length === 0) {
            setSpeechState({ speaking: false, paused: false, source: "idle", label: "There is no readable page content to speak." });
            return;
        }

        stopReadAloud("Starting page reading.");
        speechQueue = getReadableNodes(talkbackScopeRoot);
        speechIndex = 0;
        speechMode  = "page";
        speakNextBlock();
    }

    function pauseReadAloud() {
        if (!speechApi || !speechState.speaking || speechState.paused) {
            return;
        }

        speechApi.pause();
        setSpeechState({ speaking: true, paused: true, source: speechMode === "page" ? "page" : "live", label: "Talkback paused." });
    }

    function resumeReadAloud() {
        if (!speechApi || !speechState.speaking || !speechState.paused) {
            return;
        }

        speechApi.resume();
        setSpeechState({ speaking: true, paused: false, source: speechMode === "page" ? "page" : "live", label: "Talkback resumed." });
    }

    function subscribeSpeech(listener) {
        if (typeof listener !== "function") {
            return function noop() {};
        }

        speechSubscribers.push(listener);
        listener({
            supported: speechState.supported,
            speaking:  speechState.speaking,
            paused:    speechState.paused,
            source:    speechState.source,
            label:     speechState.label,
        });

        return function unsubscribeSpeech() {
            speechSubscribers = speechSubscribers.filter(function filterSpeechSubscriber(subscriber) {
                return subscriber !== listener;
            });
        };
    }

    /* ============================================================
       STATE — initial load
    ============================================================ */

    var state = loadState();

    /* ============================================================
       ROOT SYNC — data-* attributes + CSS custom properties
    ============================================================ */

    function updateRootVariables(nextState) {
        var effectiveTheme = getEffectiveTheme(nextState);
        var adjustedMeasure =
            nextState.readingMode === "focused"
                ? "68ch"
                : "100%";

        /* ── data-* attribute contract ── */
        root.dataset.theme          = effectiveTheme;
        root.dataset.appearance     = nextState.appearance;
        root.dataset.palette        = nextState.palette;
        root.dataset.contrast       = nextState.contrast;
        root.dataset.depth          = nextState.depth;
        root.dataset.font           = nextState.font;
        root.dataset.tint           = nextState.tint;
        root.dataset.filterStrength = nextState.filterStrength;
        root.dataset.reader         = nextState.readingMode;
        root.dataset.guide          = nextState.readingGuide;
        root.dataset.talkback       = nextState.talkbackMode;
        root.dataset.bold           = nextState.boldText;
        root.dataset.motion         = nextState.motion;
        root.dataset.transparency   = nextState.transparency;
        root.dataset.focus          = nextState.focusBoost;
        root.dataset.links          = nextState.underlineLinks;
        root.dataset.landmark       = nextState.landmark;
        root.dataset.media          = nextState.dimMedia;
        root.dataset.spacing =
            nextState.lineSpacing      !== defaults.lineSpacing      ||
            nextState.paragraphSpacing !== defaults.paragraphSpacing ||
            nextState.letterSpacing    !== defaults.letterSpacing    ||
            nextState.wordSpacing      !== defaults.wordSpacing
                ? "custom"
                : "default";

        /* color-scheme hint so browsers match native UI (scrollbars, inputs) */
        root.style.colorScheme = effectiveTheme === "dark" ? "dark" : "light";

        /* ── CSS custom property updates ── */
        root.style.setProperty("--gm-font-scale",    String(nextState.fontScale / 100));
        root.style.setProperty("--gm-line-height",   String(1.65 * (nextState.lineSpacing / 100)));
        root.style.setProperty("--gm-paragraph-gap", String(nextState.paragraphSpacing / 100) + "rem");
        root.style.setProperty("--gm-letter-spacing", String(nextState.letterSpacing / 100) + "em");
        root.style.setProperty("--gm-word-spacing",  String(nextState.wordSpacing / 50) + "em");
        root.style.setProperty("--gm-reading-measure", adjustedMeasure);

        updateGuideLayer(nextState);

        if (nextState.talkbackMode === "off" && speechMode === "live") {
            stopReadAloud("Talkback is off.");
        }

        if (nextState.talkbackMode === "off") {
            clearTalkbackTarget();
        }
    }

    /* syncForms — reads all [data-accessibility-form] elements and writes
       current state back into their fields. Called after every state change. */
    function syncForms() {
        var forms = document.querySelectorAll("[data-accessibility-form]");

        forms.forEach(function syncForm(form) {
            var formState = getState();

            [
                "appearance",
                "palette",
                "contrast",
                "depth",
                "font",
                "tint",
                "filterStrength",
                "readingMode",
                "readingGuide",
                "speechRate",
                "boldText",
                "motion",
                "transparency",
                "landmark",
            ].forEach(function syncSelect(name) {
                var field = form.querySelector('[name="' + name + '"]');

                if (field) {
                    field.value = String(formState[name]);
                }
            });

            var talkbackModeField       = form.querySelector('[name="talkbackMode"]');
            var talkbackEnabledField    = form.querySelector('[name="talkbackEnabled"]');
            var talkbackInvocationField = form.querySelector('[name="talkbackInvocation"]');

            if (talkbackModeField) {
                talkbackModeField.value = String(formState.talkbackMode);
            }

            if (talkbackEnabledField) {
                talkbackEnabledField.value = formState.talkbackMode === "off" ? "off" : "on";
            }

            if (talkbackInvocationField) {
                talkbackInvocationField.value =
                    formState.talkbackMode === "hover"
                        ? "hover"
                        : formState.talkbackMode === "both"
                          ? "both"
                          : "focus";
            }

            [
                "fontScale",
                "lineSpacing",
                "paragraphSpacing",
                "letterSpacing",
                "wordSpacing",
            ].forEach(function syncRange(name) {
                var field = form.querySelector('[name="' + name + '"]');

                if (field) {
                    field.value = String(formState[name]);
                }
            });

            [
                "focusBoost",
                "underlineLinks",
                "dimMedia",
            ].forEach(function syncSupportField(name) {
                var field = form.querySelector('[name="' + name + '"]');

                if (!field) {
                    return;
                }

                if (field.type === "checkbox") {
                    field.checked = formState[name] !== "default";
                    return;
                }

                field.value = String(formState[name]);
            });
        });
    }

    /* ============================================================
       PUBLIC API
    ============================================================ */

    var previousAnnouncedState = null;

    function announceEngineChange(currentState) {
        var el = document.querySelector("[data-engine-status]");
        if (!el) return;

        if (previousAnnouncedState === null) {
            previousAnnouncedState = Object.assign({}, currentState);
            return;
        }

        var axisLabels = {
            appearance: { light: "light mode", dark: "dark mode", default: "automatic mode" },
            palette: {
                default: "default palette", monochrome: "monochrome palette", blue: "blue palette",
                aqua: "aqua palette", green: "green palette", yellow: "yellow palette",
                red: "red palette", orange: "orange palette", purple: "purple palette", pink: "pink palette"
            },
            contrast: {
                default: "standard contrast",
                "plus-1": "contrast plus 1", "plus-2": "contrast plus 2", "plus-3": "contrast plus 3",
                "plus-4": "contrast plus 4", "plus-5": "contrast plus 5",
                "minus-1": "contrast minus 1", "minus-2": "contrast minus 2", "minus-3": "contrast minus 3",
                "minus-4": "contrast minus 4", "minus-5": "contrast minus 5"
            },
            font: { default: "default font", legible: "Hyperlegible font", dyslexia: "OpenDyslexic font", system: "system font" },
            motion: { default: "animations on", reduced: "animations reduced", off: "animations off" },
            tint: { default: "no tint", warm: "warm tint", cool: "cool tint", soft: "soft tint", monochrome: "monochrome filter", dim: "screen dimmed", bright: "screen brightened" },
            depth: { default: "full depth", reduced: "depth reduced", off: "depth removed" },
            landmark: { off: "landmarks off", soft: "soft landmarks on", clear: "clear landmarks on" },
            readingMode: { off: "reading mode off", focused: "focused reading mode on" },
            dimMedia: { off: "media at full", medium: "media dimmed", high: "media heavily dimmed" },
            boldText: { default: "standard weight", "level-1": "bold level 1", "level-2": "bold level 2", "level-3": "bold level 3", "level-4": "bold level 4" },
            focusBoost: { default: "standard focus", medium: "enhanced focus ring", high: "high visibility focus ring" },
            underlineLinks: { default: "standard links", medium: "underlined links", high: "highlighted links" }
        };

        var watched = ["appearance", "palette", "contrast", "font", "motion", "tint", "depth", "landmark", "readingMode", "dimMedia", "boldText", "focusBoost", "underlineLinks"];
        var changes = [];

        watched.forEach(function(key) {
            if (currentState[key] !== previousAnnouncedState[key]) {
                var map = axisLabels[key];
                var label = (map && map[currentState[key]] !== undefined)
                    ? map[currentState[key]]
                    : key + " " + currentState[key];
                changes.push(label);
            }
        });

        previousAnnouncedState = Object.assign({}, currentState);

        if (changes.length === 0) return;

        var message = "Accessibility updated: " + changes.join(", ");
        el.textContent = "";
        requestAnimationFrame(function() {
            el.textContent = message;
        });
    }

    function notifySubscribers() {
        subscribers.forEach(function notify(listener) {
            listener(getState());
        });
        announceEngineChange(state);
    }

    function syncLogos(themeName) {
        var shouldUseDarkLogo = themeName === "dark";
        var logos = document.querySelectorAll("[data-logo-default][data-logo-dark]");

        logos.forEach(function syncLogoImage(logo) {
            var nextSource = shouldUseDarkLogo
                ? logo.getAttribute("data-logo-dark")
                : logo.getAttribute("data-logo-default");

            if (nextSource && logo.getAttribute("src") !== nextSource) {
                logo.setAttribute("src", nextSource);
            }
        });
    }

    function applyState(nextState) {
        state = normalizeState({ ...defaults, ...nextState });
        updateRootVariables(state);
        syncLogos(getEffectiveTheme(state));
        syncForms();
        notifySubscribers();
    }

    function getState() {
        return { ...state };
    }

    function updateState(partialState, persist) {
        applyState({ ...state, ...partialState });

        if (persist !== false) {
            writeStorage(state);
        }
    }

    function resetState() {
        applyState({ ...defaults });
        writeStorage(state);
    }

    function subscribe(listener) {
        if (typeof listener !== "function") {
            return function noop() {};
        }

        subscribers.push(listener);
        listener(getState());

        return function unsubscribe() {
            subscribers = subscribers.filter(function filterSubscriber(subscriber) {
                return subscriber !== listener;
            });
        };
    }

    function syncWithSystemTheme() {
        if (!systemDarkQuery) {
            return;
        }

        if (state.appearance === "default") {
            applyState(state);
        }
    }

    /* ============================================================
       EVENT LISTENERS
    ============================================================ */

    document.addEventListener("mousemove", handleGuidePointer, { passive: true });
    document.addEventListener("touchstart", handleGuidePointer, { passive: true });
    document.addEventListener("touchmove", handleGuidePointer, { passive: true });

    window.addEventListener("resize", function syncGuideOnResize() {
        moveGuide(guideY);
    });

    document.addEventListener("visibilitychange", function stopSpeechOnHide() {
        if (document.hidden && speechState.speaking) {
            stopReadAloud("Talkback paused when the page left view.");
        }
    });

    document.addEventListener("focusin", function handleTalkbackFocus(event) {
        if (!shouldUseScopedTalkback(event.target) && !shouldUseFocusTalkback()) {
            return;
        }

        queueLiveTargetSpeech(event.target, "focus", { includeSelectValue: false });
    });

    document.addEventListener("click", function handleScopedTalkbackTap(event) {
        var target = getTalkbackTarget(event.target);

        if (!shouldUseScopedTalkback(event.target)) {
            return;
        }

        if (target && target.tagName && target.tagName.toLowerCase() === "select") {
            queueLiveTargetSpeech(target, "focus", {
                includeSelectValue: false,
                immediate:          isAppleMobilePlatform,
            });
            return;
        }

        if (canUsePointerTalkback()) {
            return;
        }

        queueLiveTargetSpeech(event.target, "focus", {
            includeSelectValue: false,
            immediate:          isAppleMobilePlatform,
        });
    });

    document.addEventListener("touchend", function handleScopedTalkbackTouch(event) {
        var target = getTalkbackTarget(event.target);

        if (!isAppleMobilePlatform || !shouldUseScopedTalkback(event.target)) {
            return;
        }

        queueLiveTargetSpeech(target || event.target, "focus", {
            includeSelectValue: false,
            immediate:          true,
        });
    });

    document.addEventListener("keydown", function handleScopedSelectKeys(event) {
        var target = getTalkbackTarget(event.target);
        var key    = event.key;
        var isSelectionKey =
            key === "ArrowDown" || key === "ArrowUp" ||
            key === "Home"      || key === "End"     ||
            key === "PageUp"    || key === "PageDown";

        if (
            !target ||
            !shouldUseScopedTalkback(target) ||
            !target.tagName ||
            target.tagName.toLowerCase() !== "select"
        ) {
            return;
        }

        if (key !== "Enter" && key !== " " && !isSelectionKey) {
            return;
        }

        queueLiveTargetSpeech(target, "focus", {
            includeSelectValue: false,
            optionOnly:         isSelectionKey,
            immediate:          true,
        });
    });

    document.addEventListener("input", function handleScopedSelectInput(event) {
        var target = getTalkbackTarget(event.target);

        if (
            !target ||
            !shouldUseScopedTalkback(target) ||
            !target.tagName ||
            target.tagName.toLowerCase() !== "select"
        ) {
            return;
        }

        queueLiveTargetSpeech(target, "focus", {
            includeSelectValue: true,
            optionOnly:         true,
            immediate:          isAppleMobilePlatform,
        });
    });

    document.addEventListener("change", function handleScopedSelectChange(event) {
        var target = getTalkbackTarget(event.target);

        if (
            !target ||
            !shouldUseScopedTalkback(target) ||
            !target.tagName ||
            target.tagName.toLowerCase() !== "select"
        ) {
            return;
        }

        queueLiveTargetSpeech(target, "focus", {
            includeSelectValue: true,
            optionOnly:         true,
            immediate:          isAppleMobilePlatform,
        });
    });

    document.addEventListener(
        "mousemove",
        function handleTalkbackPointer(event) {
            var pointerTarget = null;

            if (!shouldUseHoverTalkback() || !canUsePointerTalkback()) {
                return;
            }

            pointerTarget = document.elementFromPoint(event.clientX, event.clientY);
            pointerTarget = getPointerTalkbackTarget(pointerTarget, event);

            if (!pointerTarget) {
                clearTalkbackTarget();
                return;
            }

            if (pointerTarget === lastTalkbackNode) {
                return;
            }

            queueLiveTargetSpeech(pointerTarget, "pointer");
        },
        { passive: true },
    );

    if (systemDarkQuery) {
        if (typeof systemDarkQuery.addEventListener === "function") {
            systemDarkQuery.addEventListener("change", syncWithSystemTheme);
        } else if (typeof systemDarkQuery.addListener === "function") {
            systemDarkQuery.addListener(syncWithSystemTheme);
        }
    }

    if (speechApi && typeof speechApi.addEventListener === "function") {
        speechApi.addEventListener("voiceschanged", cacheSpeechVoices);
    } else if (speechApi && "onvoiceschanged" in speechApi) {
        speechApi.onvoiceschanged = cacheSpeechVoices;
    }

    /* ============================================================
       BOOT
    ============================================================ */

    annotateRegions();
    ensureGuideLayer();
    cacheSpeechVoices();
    applyState(state);

    /* ============================================================
       EXPORT
    ============================================================ */

    window.accessibilityEngine = {
        defaults:               { ...defaults },
        getEffectiveTheme:      getEffectiveTheme,
        getState:               getState,
        normalizeState:         normalizeState,
        updateState:            updateState,
        resetState:             resetState,
        subscribe:              subscribe,
        syncForms:              syncForms,
        getPageMap:             getPageMap,
        jumpTo:                 jumpTo,
        isSpeechSupported:      function isSpeechSupported()  { return Boolean(speechApi); },
        getSpeechState:         function getSpeechState()      {
            return {
                supported: speechState.supported,
                speaking:  speechState.speaking,
                paused:    speechState.paused,
                source:    speechState.source,
                label:     speechState.label,
            };
        },
        subscribeSpeech:        subscribeSpeech,
        startReadAloud:         startReadAloud,
        pauseReadAloud:         pauseReadAloud,
        resumeReadAloud:        resumeReadAloud,
        stopReadAloud:          stopReadAloud,
        activateScopedTalkback: activateScopedTalkback,
        deactivateScopedTalkback: deactivateScopedTalkback,
    };

})();
