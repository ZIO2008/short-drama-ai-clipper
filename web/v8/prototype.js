const body = document.body;
const stepTabs = [...document.querySelectorAll(".step-tab")];
const taskPages = [...document.querySelectorAll(".task-page")];
const monitorMode = document.querySelector("#monitorMode");
const monitorTitle = document.querySelector("#monitorTitle");
const formatPill = document.querySelector("#formatPill");
const sourceEyebrow = document.querySelector("#sourceEyebrow");
const sourceTitle = document.querySelector("#sourceTitle");
const timelineTitle = document.querySelector("#timelineTitle");
const timelineMeta = document.querySelector("#timelineMeta");
const timelineScale = document.querySelector(".timeline-scale");
const clipSummary = document.querySelector("#clipSummary");
const homeProjectTitle = document.querySelector("#homeProjectTitle");
const homeProjectDesc = document.querySelector("#homeProjectDesc");
const homeStatMedia = document.querySelector("#homeStatMedia");
const homeStatClips = document.querySelector("#homeStatClips");
const homeStatReview = document.querySelector("#homeStatReview");
const sourceHint = document.querySelector("#sourceHint");
const episodeCountLabel = document.querySelector("#episodeCountLabel");
const clipCountLabel = document.querySelector("#clipCountLabel");
const playButton = document.querySelector(".play-button");
const previewVideo = document.querySelector("#previewVideo");
const videoPlaceholder = document.querySelector("#videoPlaceholder");
const previewCurrentTime = document.querySelector("#previewCurrentTime");
const previewEndTime = document.querySelector("#previewEndTime");
const previewProgress = document.querySelector("#previewProgress");
const editTimeline = document.querySelector("#editTimeline");
const selectedRange = document.querySelector("#selectedRange");
const trimHandleStart = document.querySelector("#trimHandleStart");
const trimHandleEnd = document.querySelector("#trimHandleEnd");
const timelinePlayhead = document.querySelector("#timelinePlayhead");
const projectChipTitle = document.querySelector(".project-chip strong");
const projectChipMeta = document.querySelector(".project-chip span");
const projectList = document.querySelector("#projectList");
const episodeList = document.querySelector("#episodeList");
const clipList = document.querySelector("#clipList");
const clipEpisodeGrid = document.querySelector("#clipEpisodeGrid");
const clipEpisodePickMeta = document.querySelector("#clipEpisodePickMeta");
const newProjectNameInput = document.querySelector("#newProjectNameInput");
const assetUploadInput = document.querySelector("#assetUploadInput");
const srtUploadInput = document.querySelector("#srtUploadInput");
const clipStartEpisodeInput = document.querySelector("#clipStartEpisodeInput");
const clipEndEpisodeInput = document.querySelector("#clipEndEpisodeInput");
const clipTargetInput = document.querySelector("#clipTargetInput");
const singleEpisodeInput = document.querySelector("#singleEpisodeInput");
const singleTargetInput = document.querySelector("#singleTargetInput");
const minimumDurationInput = document.querySelector("#minimumDurationInput");
const singleClipActionPanel = document.querySelector("[data-single-clip-action]");
const mediaImportSummary = document.querySelector("#mediaImportSummary");
const mediaImportDetail = document.querySelector("#mediaImportDetail");
const importAssetsButton = document.querySelector("[data-import-assets]");
const clipStatusDetail = document.querySelector("#clipStatusDetail");
const startClipButton = document.querySelector("#startClipButton");
const cancelClippingButton = document.querySelector("[data-clipping-cancel]");
const subtitleRequiredWarning = document.querySelector("#subtitleRequiredWarning");
const subtitleAsrStatus = document.querySelector("#subtitleAsrStatus");
const subtitleApiProviderLabel = document.querySelector("#subtitleApiProviderLabel");
const subtitleApiReadyLabel = document.querySelector("#subtitleApiReadyLabel");
const subtitleApiHint = document.querySelector("#subtitleApiHint");
const subtitleSrtStatus = document.querySelector("#subtitleSrtStatus");
const clipProgressLabel = document.querySelector("#clipProgressLabel");
const clipProgressText = document.querySelector("#clipProgressText");
const clipProgressBar = document.querySelector("#clipProgressBar");
const reviewCandidateTitle = document.querySelector("#reviewCandidateTitle");
const reviewCandidateMeta = document.querySelector("#reviewCandidateMeta");
const reviewStartTime = document.querySelector("#reviewStartTime");
const reviewEndTime = document.querySelector("#reviewEndTime");
const reviewRiskText = document.querySelector("#reviewRiskText");
const aiCandidateCard = document.querySelector("#aiCandidateCard");
const aiCandidateMeta = document.querySelector("#aiCandidateMeta");
const aiCandidateList = document.querySelector("#aiCandidateList");
const reviewActionButtons = [...document.querySelectorAll("[data-review-action]")];
const aiReselectButton = document.querySelector("[data-ai-reselect]");
const aiReselectGroup = document.querySelector("[data-ai-reselect-group]");
const trimDecisionPanel = document.querySelector("[data-trim-decision-panel]");
const exportConfirmedCount = document.querySelector("#exportConfirmedCount");
const exportPendingCount = document.querySelector("#exportPendingCount");
const exportFailedCount = document.querySelector("#exportFailedCount");
const exportOutputDirInput = document.querySelector("#exportOutputDirInput");
const exportProgressCard = document.querySelector(".export-progress");
const exportProgressLabel = document.querySelector("#exportProgressLabel");
const exportProgressText = document.querySelector("#exportProgressText");
const exportProgressBar = document.querySelector("#exportProgressBar");
const exportTaskText = document.querySelector("#exportTaskText");
const exportToolStatus = document.querySelector("#exportToolStatus");
const exportDeliveryNote = document.querySelector("#exportDeliveryNote");
const exportEpisodeList = document.querySelector("#exportEpisodeList");
const exportActionButtons = [...document.querySelectorAll("[data-export-scope]")];
const modelConfigStatus = document.querySelector("#modelConfigStatus");
const asrConfigStatus = document.querySelector("#asrConfigStatus");
const deepseekApiKeyInput = document.querySelector("#deepseekApiKeyInput");
const openaiApiKeyInput = document.querySelector("#openaiApiKeyInput");
const openaiAsrApiKeyInput = document.querySelector("#openaiAsrApiKeyInput");
const modelProviderSelect = document.querySelector("#modelProviderSelect");
const modelProxyInput = document.querySelector("#modelProxyInput");
const asrProviderSelect = document.querySelector("#asrProviderSelect");
const tencentSecretIdInput = document.querySelector("#tencentSecretIdInput");
const tencentSecretKeyInput = document.querySelector("#tencentSecretKeyInput");
const xfyunAppIdInput = document.querySelector("#xfyunAppIdInput");
const xfyunApiKeyInput = document.querySelector("#xfyunApiKeyInput");
const xfyunApiSecretInput = document.querySelector("#xfyunApiSecretInput");
const localAsrModelInput = document.querySelector("#localAsrModelInput");
const settingsSaveStatus = document.querySelector("#settingsSaveStatus");
const modelReadyBadge = document.querySelector("#modelReadyBadge");
const asrReadyBadge = document.querySelector("#asrReadyBadge");
const appDialog = document.querySelector("#appDialog");
const appDialogTitle = document.querySelector("#appDialogTitle");
const appDialogMessage = document.querySelector("#appDialogMessage");
const appDialogInput = document.querySelector("#appDialogInput");
const appDialogConfirmButton = document.querySelector("[data-dialog-confirm]");
const appDialogCancelButton = document.querySelector("[data-dialog-cancel]");
let isPlaying = false;
let realState = null;
let selectedEpisode = "1";
let selectedClipId = "";
let activePreviewClip = null;
let previewMode = "clip";
let activeClipMode = "batch";
let activeClipAction = "replace";
let clippingEstimateTimer = 0;
let selectedClipEpisodes = new Set();
let draftTrim = null;
let exportPreviewRequestId = 0;
let activeClippingJobId = "";
let lastClippingJobId = "";
let isClippingJobActive = false;
let latestClippingJob = null;
let displayedClippingProgress = 0;
let displayedClippingJobId = "";
let latestSubtitleGate = null;
let latestTranscriptQueue = null;
let isSubtitlePreparationActive = false;
let reviewQualityRequestId = 0;
let activeReviewTab = "boundary";
let latestReviewQuality = null;
let selectedAiCandidateId = "";
let appDialogResolve = null;
let previewCacheJobId = "";
let previewCachePolling = false;
let previewLoadToken = 0;

const episodeClipMeta = {
  1: { episodeLabel: "已选第1集", clipLabel: "第1集 · 2条", status: "已切片" },
  2: { episodeLabel: "已选第2集", clipLabel: "第2集 · 3条", status: "已切片" },
  3: { episodeLabel: "已选第3集", clipLabel: "第3集 · 3条", status: "已切片" },
  4: { episodeLabel: "已选第4集", clipLabel: "第4集 · 暂无", status: "需确认" },
  5: { episodeLabel: "已选第5集", clipLabel: "第5集 · 未切片", status: "未切片" },
  6: { episodeLabel: "已选第6集", clipLabel: "第6集 · 已删除", status: "已删除" },
};

const pageCopy = {
  media: {
    mode: "原片监视器",
    title: "EP01 · 01.mp4",
    sourceEyebrow: "素材区",
    sourceTitle: "剧集与切片",
    timelineTitle: "项目时间线",
    timelineMeta: "",
  },
  clip: {
    mode: "原片监视器",
    title: "EP01 · AI 正在寻找吸引人的戏",
    sourceEyebrow: "素材区",
    sourceTitle: "剧集与切片",
    timelineTitle: "候选时间线",
    timelineMeta: "",
  },
  review: {
    mode: "片段监视器",
    title: "第1集 · 候选1",
    sourceEyebrow: "素材区",
    sourceTitle: "剧集与切片",
    timelineTitle: "剪辑时间线",
    timelineMeta: "开始 12.4s · 结束 70.0s · 时长 57.6s",
  },
  export: {
    mode: "导出中心",
    title: "第1集 · 已确认片段",
    sourceEyebrow: "素材区",
    sourceTitle: "剧集与切片",
    timelineTitle: "交付时间线",
    timelineMeta: "只导出已确认且未导出的片段",
  },
};

function setPage(page) {
  if (!pageCopy[page]) return;
  body.dataset.page = page;
  stepTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.pageTarget === page);
  });
  taskPages.forEach((section) => {
    section.classList.toggle("active", section.dataset.taskPage === page);
  });
  monitorMode.textContent = pageCopy[page].mode;
  monitorTitle.textContent = pageCopy[page].title;
  sourceEyebrow.textContent = pageCopy[page].sourceEyebrow;
  sourceTitle.textContent = pageCopy[page].sourceTitle;
  sourceHint.textContent = "";
  timelineTitle.textContent = pageCopy[page].timelineTitle;
  timelineMeta.textContent = pageCopy[page].timelineMeta;
}

function openWorkbench(target = "media") {
  setPage(target);
  if (realState) {
    renderSourceState(realState);
    renderClipSetupState(realState);
    if (target === "media" || target === "clip") {
      previewMode = "episode";
      loadEpisodePreview(realState);
    } else {
      renderReviewState(realState);
    }
    renderExportState(realState);
  }
}

function openSettingsPage() {
  body.dataset.page = "settings";
  loadSettingsPage();
}

function closeSettingsPage() {
  body.dataset.page = "media";
  setPage("media");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch (error) {
      // keep the HTTP status fallback
    }
    throw new Error(message);
  }
  return response.json();
}

function approvedClipCount(clips) {
  return clips.filter((clip) => clip.status === "confirmed").length;
}

function activeClipCount(clips) {
  return clips.filter((clip) => !clip.deleted_at && !["deleted", "discarded"].includes(clip.status)).length;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function envConfigured(payload, key) {
  return Boolean(payload?.keys?.[key]?.configured);
}

function setSettingsStatus(element, title, detail) {
  if (!element) return;
  element.textContent = detail ? `${title}：${detail}` : title;
}

function setSettingsSaveStatus(title, detail = "", tone = "") {
  if (!settingsSaveStatus) return;
  settingsSaveStatus.classList.toggle("saved", tone === "saved");
  settingsSaveStatus.classList.toggle("error", tone === "error");
  settingsSaveStatus.querySelector("strong").textContent = title;
  settingsSaveStatus.querySelector("span").textContent = detail;
}

function closeAppDialog(result = null) {
  if (!appDialog) return;
  appDialog.hidden = true;
  const resolve = appDialogResolve;
  appDialogResolve = null;
  if (appDialogInput) {
    appDialogInput.value = "";
    appDialogInput.hidden = true;
  }
  if (resolve) resolve(result);
}

function showAppDialog({ title = "确认操作", message = "", confirmText = "确定", danger = false, input = false, value = "" } = {}) {
  if (!appDialog) return Promise.resolve(null);
  if (appDialogTitle) appDialogTitle.textContent = title;
  if (appDialogMessage) appDialogMessage.textContent = message;
  if (appDialogConfirmButton) {
    appDialogConfirmButton.textContent = confirmText;
    appDialogConfirmButton.classList.toggle("danger-button", danger);
    appDialogConfirmButton.classList.toggle("primary-button", !danger);
  }
  if (appDialogInput) {
    appDialogInput.hidden = !input;
    appDialogInput.value = value;
  }
  appDialog.hidden = false;
  if (input) window.setTimeout(() => appDialogInput?.focus(), 0);
  return new Promise((resolve) => {
    appDialogResolve = resolve;
  });
}

async function confirmAction(options) {
  return Boolean(await showAppDialog(options));
}

async function promptProjectName(currentName) {
  const value = await showAppDialog({
    title: "重命名项目",
    message: "",
    confirmText: "保存",
    input: true,
    value: currentName || "",
  });
  return value === null ? "" : String(value || "").trim();
}

function currentAsrProviderName(provider) {
  return ({
    local: "本地字幕模型",
    tencent: "腾讯云 ASR",
    xfyun: "科大讯飞 ASR",
    openai: "OpenAI Whisper",
  })[provider] || provider || "ASR";
}

function setReadyBadge(element, ready, providerName) {
  if (!element) return;
  element.textContent = ready ? `已配置 · ${providerName}` : `未配置 · ${providerName}`;
  element.classList.toggle("ready", Boolean(ready));
  element.classList.toggle("missing", !ready);
}

function markSettingsNavConfigured(tab, ready) {
  const button = document.querySelector(`[data-settings-tab="${tab}"]`);
  button?.classList.toggle("configured", Boolean(ready));
}

function setSecretInputState(input, keyStatus) {
  if (!input) return;
  const configured = Boolean(keyStatus?.configured);
  input.dataset.configuredSecret = configured ? "true" : "false";
  input.value = configured ? "••••••••••••••••••••••••••••••••" : "";
  input.placeholder = configured ? "" : "粘贴 API Key";
}

function setSettingsTab(tab) {
  const nextTab = tab || "model";
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === nextTab);
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === nextTab);
  });
}

function updateProviderFields() {
  const modelProvider = modelProviderSelect?.value || "deepseek";
  const asrProvider = asrProviderSelect?.value || "tencent";
  document.querySelectorAll("[data-model-provider]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.modelProvider === modelProvider);
  });
  document.querySelectorAll("[data-asr-provider]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.asrProvider === asrProvider);
  });
}

async function loadSettingsPage() {
  try {
    const payload = await requestJson("/api/settings/env-status");
    const settings = payload.settings || {};
    const model = settings.model || {};
    const asr = settings.asr || {};
    if (modelProviderSelect) modelProviderSelect.value = model.provider || "deepseek";
    if (modelProxyInput) modelProxyInput.value = model.proxy_url || "";
    if (asrProviderSelect) asrProviderSelect.value = asr.provider || payload.asr_catalog?.current || "tencent";
    if (localAsrModelInput) localAsrModelInput.value = asr.model_name || "small";
    setSecretInputState(deepseekApiKeyInput, payload.keys?.DEEPSEEK_API_KEY);
    setSecretInputState(openaiApiKeyInput, payload.keys?.OPENAI_API_KEY);
    setSecretInputState(openaiAsrApiKeyInput, payload.keys?.OPENAI_API_KEY);
    setSecretInputState(tencentSecretIdInput, payload.keys?.TENCENT_ASR_SECRET_ID);
    setSecretInputState(tencentSecretKeyInput, payload.keys?.TENCENT_ASR_SECRET_KEY);
    setSecretInputState(xfyunAppIdInput, payload.keys?.XFYUN_ASR_APP_ID);
    setSecretInputState(xfyunApiKeyInput, payload.keys?.XFYUN_ASR_API_KEY);
    setSecretInputState(xfyunApiSecretInput, payload.keys?.XFYUN_ASR_API_SECRET);
    updateProviderFields();
    const modelProvider = modelProviderSelect?.value || "deepseek";
    const modelReady = modelProvider === "openai" ? envConfigured(payload, "OPENAI_API_KEY") : envConfigured(payload, "DEEPSEEK_API_KEY");
    const asrProvider = asrProviderSelect?.value || "tencent";
    const asrReady = asrProvider === "local"
      ? Boolean(payload.asr_catalog?.local_asr?.ready)
      : asrProvider === "tencent"
      ? envConfigured(payload, "TENCENT_ASR_SECRET_ID") && envConfigured(payload, "TENCENT_ASR_SECRET_KEY")
      : asrProvider === "xfyun"
        ? envConfigured(payload, "XFYUN_ASR_APP_ID") && envConfigured(payload, "XFYUN_ASR_API_KEY") && envConfigured(payload, "XFYUN_ASR_API_SECRET")
        : envConfigured(payload, "OPENAI_API_KEY");
    const modelName = modelProvider === "openai" ? "OpenAI" : "DeepSeek";
    const asrName = asr.display_name || (asrProvider === "xfyun" ? "科大讯飞" : asrProvider === "tencent" ? "腾讯云" : "OpenAI");
    setSettingsStatus(modelConfigStatus, modelReady ? "已配置" : "未配置", modelName);
    setSettingsStatus(asrConfigStatus, asrReady ? "已配置" : "未配置", asrName);
    setReadyBadge(modelReadyBadge, modelReady, modelName);
    setReadyBadge(asrReadyBadge, asrReady, asrName);
    markSettingsNavConfigured("model", modelReady);
    markSettingsNavConfigured("asr", asrReady);
  } catch (error) {
    setSettingsStatus(modelConfigStatus, "读取失败", error.message);
    setSettingsStatus(asrConfigStatus, "读取失败", error.message);
    setReadyBadge(modelReadyBadge, false, "读取失败");
    setReadyBadge(asrReadyBadge, false, "读取失败");
  }
}

async function saveSettingsPage(button) {
  const previous = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "保存中…";
  }
  setSettingsSaveStatus("保存中", "");
  try {
    const envPayload = {};
    const modelProvider = modelProviderSelect?.value || "deepseek";
    const asrProvider = asrProviderSelect?.value || "tencent";
    const secretValue = (input) => input?.dataset.configuredSecret === "true" ? "" : input?.value.trim();
    if (modelProvider === "openai" && secretValue(openaiApiKeyInput)) envPayload.OPENAI_API_KEY = secretValue(openaiApiKeyInput);
    if (modelProvider === "deepseek" && secretValue(deepseekApiKeyInput)) envPayload.DEEPSEEK_API_KEY = secretValue(deepseekApiKeyInput);
    if (asrProvider === "tencent") {
      if (secretValue(tencentSecretIdInput)) envPayload.TENCENT_ASR_SECRET_ID = secretValue(tencentSecretIdInput);
      if (secretValue(tencentSecretKeyInput)) envPayload.TENCENT_ASR_SECRET_KEY = secretValue(tencentSecretKeyInput);
    }
    if (asrProvider === "xfyun") {
      if (secretValue(xfyunAppIdInput)) envPayload.XFYUN_ASR_APP_ID = secretValue(xfyunAppIdInput);
      if (secretValue(xfyunApiKeyInput)) envPayload.XFYUN_ASR_API_KEY = secretValue(xfyunApiKeyInput);
      if (secretValue(xfyunApiSecretInput)) envPayload.XFYUN_ASR_API_SECRET = secretValue(xfyunApiSecretInput);
    }
    if (asrProvider === "openai" && secretValue(openaiAsrApiKeyInput)) envPayload.OPENAI_API_KEY = secretValue(openaiAsrApiKeyInput);
    if (modelProxyInput?.value.trim()) {
      envPayload.HTTPS_PROXY = modelProxyInput.value.trim();
      envPayload.HTTP_PROXY = modelProxyInput.value.trim();
    }
    const envResult = await requestJson("/api/settings/env", { method: "POST", body: JSON.stringify(envPayload) });
    await requestJson("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        model: {
          provider: modelProvider,
          display_name: modelProvider === "openai" ? "OpenAI" : "DeepSeek",
          api_key_env: modelProvider === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY",
          model_name: modelProvider === "openai" ? "gpt-4o-mini" : "deepseek-chat",
          proxy_url: modelProxyInput?.value.trim() || "",
        },
        asr: { provider: asrProvider, model_name: asrProvider === "local" ? (localAsrModelInput?.value.trim() || "small") : undefined },
      }),
    });
    if (asrProviderSelect?.value) {
      await requestJson("/api/transcript/provider", { method: "POST", body: JSON.stringify({ provider: asrProviderSelect.value }) });
    }
    [deepseekApiKeyInput, openaiApiKeyInput, openaiAsrApiKeyInput, tencentSecretIdInput, tencentSecretKeyInput, xfyunAppIdInput, xfyunApiKeyInput, xfyunApiSecretInput].forEach((input) => { if (input) input.value = ""; });
    await loadSettingsPage();
    setSettingsSaveStatus("已保存", envResult.warning || "API 配置已生效", "saved");
  } catch (error) {
    setSettingsSaveStatus("保存失败", error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous || "保存配置";
    }
  }
}

async function testAsrSettings(button) {
  const previous = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "测试中";
  }
  setSettingsSaveStatus("测试中", "正在检查字幕识别配置。");
  try {
    const provider = asrProviderSelect?.value || "tencent";
    if (provider === "local") {
      const guide = await requestJson("/api/transcript/setup-guide");
      const ready = Boolean(guide.local_asr?.ready);
      setSettingsSaveStatus(ready ? "本地模型可用" : "本地模型不可用", ready ? "可以生成字幕。" : `缺少依赖：${(guide.local_asr?.engine?.missing || []).join("、") || "whisper/torch"}`, ready ? "saved" : "error");
    } else {
      const result = await requestJson("/api/transcript/cloud-test");
      setSettingsSaveStatus(result.ok ? "API 可用" : "API 不可用", result.detail || result.fix || "", result.ok ? "saved" : "error");
    }
    await loadSettingsPage();
  } catch (error) {
    setSettingsSaveStatus("测试失败", error.message || String(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous || "测试字幕识别";
    }
  }
}

async function testAsrSettingsV8292(button) {
  const previous = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "测试中";
  }
  setSettingsSaveStatus("正在测试", "正在保存并检查当前字幕识别配置。");
  try {
    const provider = asrProviderSelect?.value || "tencent";
    await saveSettingsPage(null);
    setSettingsSaveStatus("正在测试", "配置已保存，正在检查字幕识别是否可用。");
    if (provider === "local") {
      const guide = await requestJson("/api/transcript/setup-guide");
      const ready = Boolean(guide.local_asr?.ready);
      const missing = (guide.local_asr?.engine?.missing || []).join("、") || "whisper/torch";
      setSettingsSaveStatus(
        ready ? "字幕识别可用" : "本地模型不可用",
        ready ? "本地字幕模型已就绪，可以生成字幕。" : `缺少依赖：${missing}。请先安装本地字幕模型，或改用云端 ASR。`,
        ready ? "saved" : "error",
      );
    } else {
      const result = await requestJson("/api/transcript/cloud-test");
      const providerName = currentAsrProviderName(provider);
      const checked = result.network_checked ? "已完成网络连通检查。" : "已完成密钥配置检查，真实连通会在自动生成字幕时验证。";
      setSettingsSaveStatus(
        result.ok ? "字幕识别可用" : "字幕识别不可用",
        result.ok ? `${providerName} ${checked}` : (result.fix || result.detail || `${providerName} 配置不完整。`),
        result.ok ? "saved" : "error",
      );
    }
    await loadSettingsPage();
    await refreshSubtitleGate();
  } catch (error) {
    setSettingsSaveStatus("测试失败", error.message || String(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous || "测试字幕识别";
    }
  }
}

testAsrSettings = testAsrSettingsV8292;

function sourceIdentityFromFilename(filename, fallbackEpisode = 1) {
  const stem = String(filename || "").replace(/\.[^.]+$/, "").trim();
  let match = stem.match(/^第\s*0*(\d{1,3})\s*集\s*(.*)$/i);
  if (!match) match = stem.match(/^EP\s*0*(\d{1,3})(?:\s*集)?\s*(.*)$/i);
  if (!match) match = stem.match(/^0*(\d{1,3})(?=$|[\s._\-—（(【\[])(.*)$/);
  let sourceEpisode = Number(fallbackEpisode) || 1;
  let variant = "";
  if (match) {
    const parsed = Number(match[1] || 0);
    if (parsed >= 1 && parsed <= 999) {
      sourceEpisode = parsed;
      variant = String(match[2] || "").replace(/^[\s._\-—()（）\[\]【】]+|[\s._\-—()（）\[\]【】]+$/g, "");
    }
  }
  return { sourceEpisode, variant };
}

function sourceIdentityForEpisode(episode, state = realState || {}) {
  const row = episodeRows(state).find((item) => String(item.episode) === String(episode));
  const asset = row?.asset || {};
  const fallback = sourceIdentityFromFilename(asset.filename || "", episode);
  return {
    sourceEpisode: Number(asset.source_episode || fallback.sourceEpisode || episode || 1),
    variant: String(asset.source_variant ?? fallback.variant ?? ""),
  };
}

function formatEpisode(episode, state = realState || {}) {
  const identity = sourceIdentityForEpisode(episode, state);
  const base = `EP${String(identity.sourceEpisode).padStart(2, "0")}`;
  return identity.variant ? `${base} · ${identity.variant}` : base;
}

function formatEpisodeLong(episode, state = realState || {}) {
  const identity = sourceIdentityForEpisode(episode, state);
  const base = `第${String(identity.sourceEpisode).padStart(2, "0")}集`;
  return identity.variant ? `${base} · ${identity.variant}` : base;
}

function formatEpisodeCompact(episode, state = realState || {}) {
  const identity = sourceIdentityForEpisode(episode, state);
  if (!identity.variant) return String(identity.sourceEpisode);
  const compactVariant = identity.variant.replace(/版$/, "").slice(-1) || "版";
  return `${identity.sourceEpisode}${compactVariant}`;
}

function clipStatusText(clip) {
  if (clip.status === "deleted" || clip.deleted_at) return "已删除";
  if (clip.status === "needs_edit" || clip.review_status === "changes_requested" || clip.export_stale) return "修改中";
  if (clip.exported_at) return "已导出";
  if (clip.review_status === "approved" || clip.status === "confirmed") return "已确认";
  return "待审";
}

function clipStatusClass(clip) {
  if (clip.status === "needs_edit" || clip.review_status === "changes_requested" || clip.export_stale) return "warning";
  if (clip.exported_at) return "exported";
  if (clip.review_status === "approved" || clip.status === "confirmed") return "confirmed";
  if (clip.review_status === "rejected" || clip.status === "discarded" || clip.status === "deleted" || clip.deleted_at) return "deleted";
  return "";
}

function clipWithDraftStatus(clip) {
  if (!clip || !draftTrim || draftTrim.id !== selectedClipKey(clip)) return clip;
  return {
    ...clip,
    start: draftTrim.start,
    end: draftTrim.end,
    duration: Number(Math.max(0, Number(draftTrim.end || 0) - Number(draftTrim.start || 0)).toFixed(1)),
    status: "needs_edit",
    review_status: "changes_requested",
    exported_at: "",
  };
}

function currentClips(state) {
  return (state.clips || []).filter((clip) => String(clip.episode || 1) === String(selectedEpisode));
}

function selectedClip(state) {
  const clips = state.clips || [];
  if (selectedClipId) {
    const found = clips.find((clip) => clip.id === selectedClipId);
    if (found) return found;
  }
  const scoped = currentClips(state);
  return scoped[0] || clips[0] || null;
}

function selectedClipKey(clip) {
  return clip?.id || `${clip?.episode || ""}:${clip?.clip_index || ""}`;
}

function episodeRows(state) {
  const assets = state.assets || [];
  const clips = state.clips || [];
  const episodes = new Map();
  assets.forEach((asset) => {
    const episode = String(asset.episode || 1);
    episodes.set(episode, { episode, asset, clips: [] });
  });
  clips.forEach((clip) => {
    const episode = String(clip.episode || 1);
    if (!episodes.has(episode)) episodes.set(episode, { episode, asset: null, clips: [] });
    episodes.get(episode).clips.push(clip);
  });
  return [...episodes.values()].sort((a, b) => Number(a.episode) - Number(b.episode));
}

function selectedEpisodeRow(state = realState || {}) {
  return episodeRows(state).find((row) => String(row.episode) === String(selectedEpisode)) || null;
}

function episodePreviewClip(state = realState || {}) {
  const row = selectedEpisodeRow(state);
  const asset = row?.asset || {};
  const path = asset.path || row?.clips?.[0]?.source_video || row?.clips?.[0]?.preview_video || "";
  if (!path) return null;
  const duration = Number(asset.duration || asset.source_duration || asset.episode_duration || row?.clips?.[0]?.source_duration || row?.clips?.[0]?.episode_duration || 0);
  return {
    id: `episode_${row.episode}`,
    episode: row.episode,
    clip_index: -1,
    start: 0,
    end: duration > 0 ? duration : 0,
    duration,
    source_duration: duration,
    episode_duration: duration,
    source_video: path,
    preview_video: path,
    is_episode_preview: true,
    filename: asset.filename || `第 ${row.episode} 集素材`,
  };
}

function renderProjectList(payload, deletedPayload = {}) {
  const projects = payload?.projects || [];
  const deletedProjects = deletedPayload?.projects || [];
  if (!projectList) return;
  const activeHtml = projects.length ? projects.map((project) => `
    <div class="project-card-shell ${project.active ? "active" : ""}">
      <button class="project-pick project-card-main ${project.active ? "active" : ""}" type="button" data-project-load data-state-path="${escapeHtml(project.state_path || "")}" data-base-dir="${escapeHtml(project.base_dir || "")}">
        <strong>${escapeHtml(project.project_name || "未命名项目")}</strong>
        <em>${escapeHtml(project.status_label || (project.active ? "当前" : "可打开"))}</em>
      </button>
      <button class="card-icon-action danger" type="button" data-project-delete data-state-path="${escapeHtml(project.state_path || "")}" data-base-dir="${escapeHtml(project.base_dir || "")}" aria-label="删除项目" title="删除项目" ${project.deletable ? "" : "disabled"}>×</button>
    </div>
  `).join("") : `<div class="empty-state">暂无项目</div>`;
  const deletedHtml = deletedProjects.length ? `
    <div class="project-recycle-title">回收区</div>
    ${deletedProjects.map((project) => `
      <div class="project-card-shell recycle">
        <button class="project-pick project-card-main" type="button" disabled>
          <strong>${escapeHtml(project.project_name || "已删除项目")}</strong>
          <span>已移入回收区</span>
          <em>可恢复</em>
        </button>
        <button class="card-icon-action restore" type="button" data-project-restore data-trash-path="${escapeHtml(project.base_dir || "")}" aria-label="恢复项目" title="恢复项目" ${project.restorable ? "" : "disabled"}>↺</button>
        <button class="card-icon-action danger purge" type="button" data-project-purge data-trash-path="${escapeHtml(project.base_dir || "")}" data-project-name="${escapeHtml(project.project_name || "已删除项目")}" aria-label="彻底删除项目" title="彻底删除项目">×</button>
      </div>
    `).join("")}
  ` : "";
  projectList.innerHTML = `${activeHtml}${deletedHtml}`;
}

async function loadProjectList() {
  try {
    const payload = await requestJson("/api/projects?light=1");
    let deletedPayload = {};
    try {
      deletedPayload = await requestJson("/api/projects/deleted");
    } catch (error) {
      deletedPayload = {};
    }
    renderProjectList(payload, deletedPayload);
  } catch (error) {
    if (projectList) projectList.innerHTML = `<div class="empty-state">项目列表读取失败。</div>`;
  }
}

function renderSourceState(state) {
  const rows = episodeRows(state);
  if (!rows.length) {
    if (episodeList) episodeList.innerHTML = `<div class="empty-state">暂无剧集</div>`;
    if (clipList) clipList.innerHTML = `<div class="empty-state">导入素材并切片后显示候选。</div>`;
    episodeCountLabel.textContent = "暂无剧集";
    clipCountLabel.textContent = "暂无切片";
    return;
  }
  if (!rows.some((row) => row.episode === selectedEpisode)) selectedEpisode = rows[0].episode;
  if (episodeList) {
    episodeList.innerHTML = rows.map((row) => {
      const active = row.episode === selectedEpisode;
      const filename = row.asset?.filename || `第 ${row.episode} 集素材`;
      const clipCount = row.clips.length;
      const status = clipCount ? "已切片" : "未切片";
      const episodeStatusClass = clipCount ? "episode-ready" : "episode-empty";
      const deletedClip = row.clips.find((clip) => clip.deleted_asset_path && clip.source_video);
      const assetPath = row.asset?.path || "";
      const restoreTrashPath = deletedClip?.deleted_asset_path || "";
      const restoreOriginalPath = deletedClip?.source_video || "";
      const deleted = row.asset?.deleted_at || row.asset?.asset_deleted || restoreTrashPath;
      return `
        <div class="source-card-shell">
          <button class="source-row source-card-main episode-source-row ${episodeStatusClass} ${active ? "active" : ""} ${deleted ? "deleted" : ""}" type="button" data-episode-toggle="${escapeHtml(row.episode)}">
            <strong>${formatEpisode(row.episode)} · 原剧集</strong>
            <span>${escapeHtml(filename)} · ${clipCount ? `${clipCount} 条切片` : "未切片"}</span>
            <em>${active ? "已选择" : deleted ? "已删除" : status}</em>
          </button>
          ${restoreTrashPath ? `<button class="card-icon-action source-icon restore" type="button" data-asset-restore="${escapeHtml(restoreTrashPath)}" data-original-path="${escapeHtml(restoreOriginalPath)}" aria-label="恢复素材" title="恢复素材">↺</button>` : ""}
          ${assetPath && !restoreTrashPath ? `<button class="card-icon-action source-icon danger" type="button" data-asset-delete="${escapeHtml(assetPath)}" aria-label="删除素材" title="删除素材">×</button>` : ""}
        </div>
      `;
    }).join("");
  }
  const current = rows.find((row) => row.episode === selectedEpisode) || rows[0];
  const visibleCurrentClips = current.clips.filter((clip) => clip.status !== "deleted" && !clip.deleted_at);
  if (!selectedClipId || !visibleCurrentClips.some((clip) => clip.id === selectedClipId)) {
    selectedClipId = visibleCurrentClips[0]?.id || "";
  }
  episodeCountLabel.textContent = `已选 ${formatEpisodeLong(current.episode, state)}`;
  clipCountLabel.textContent = `${formatEpisodeLong(current.episode, state)} · ${visibleCurrentClips.length} 条`;
  if (clipList) {
    const visibleClips = visibleCurrentClips;
    clipList.innerHTML = visibleClips.length ? `
      <div class="clip-panel active" data-episode-clips="${escapeHtml(current.episode)}">
        ${visibleClips.map((clip) => {
          const displayClip = clipWithDraftStatus(clip);
          const statusText = clipStatusText(displayClip);
          const duration = Number(displayClip.duration || Math.max(0, Number(displayClip.end || 0) - Number(displayClip.start || 0))).toFixed(1);
          return `
            <div class="source-card-shell clip-card-shell">
              <button class="source-row clip-row source-card-main ${clipStatusClass(displayClip)} ${previewMode === "clip" && clip.id === selectedClipId ? "active" : ""}" type="button" data-clip-id="${escapeHtml(clip.id)}">
                <strong>${escapeHtml(clip.id || `候选${Number(clip.clip_index || 0) + 1}`)}</strong>
                <span>${duration} 秒</span>
                <em>${statusText}</em>
              </button>
              <button class="card-icon-action source-icon danger" type="button" data-clip-delete="${escapeHtml(clip.id || "")}" aria-label="删除切片" title="删除切片">×</button>
            </div>
          `;
        }).join("")}
      </div>
    ` : `<div class="empty-state">暂无切片</div>`;
  }
}

function formatSeconds(value) {
  return `${Number(value || 0).toFixed(1)}s`;
}

function formatClock(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderTimelineScale(rail = timelineRail()) {
  if (!timelineScale) return;
  const duration = Math.max(1, Number(rail.duration || 1));
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = rail.start + (duration * index) / (tickCount - 1);
    return `<span>${formatClock(value)}</span>`;
  });
  timelineScale.innerHTML = ticks.join("");
}

function activeTrim() {
  const clip = activePreviewClip || selectedClip(realState || {});
  if (previewMode === "episode" && clip?.is_episode_preview) {
    const videoDuration = previewVideo && Number.isFinite(previewVideo.duration) ? previewVideo.duration : 0;
    const duration = Math.max(0, Number(clip.duration || clip.source_duration || clip.episode_duration || videoDuration || 0));
    return {
      id: selectedClipKey(clip),
      sourceClip: clip,
      start: 0,
      end: duration,
    };
  }
  const source = draftTrim && clip && draftTrim.id === selectedClipKey(clip) ? draftTrim : clip;
  return {
    id: selectedClipKey(clip),
    sourceClip: clip,
    start: Math.max(0, Number(source?.start || 0)),
    end: Math.max(0, Number(source?.end || 0)),
  };
}

function clipStart(clip = activePreviewClip) {
  if (!clip || clip === activePreviewClip) return activeTrim().start;
  return Math.max(0, Number(clip?.start || 0));
}

function clipEnd(clip = activePreviewClip) {
  if (previewMode === "episode" && (!clip || clip === activePreviewClip)) {
    const trim = activeTrim();
    const videoDuration = previewVideo && Number.isFinite(previewVideo.duration) ? previewVideo.duration : 0;
    return Math.max(trim.end, videoDuration, trim.start);
  }
  if (!clip || clip === activePreviewClip) {
    const trim = activeTrim();
    return Math.max(trim.start, trim.end || trim.start);
  }
  const end = Number(clip?.end || 0);
  return Math.max(clipStart(clip), end || clipStart(clip));
}

function clampTrim(start, end) {
  const original = activePreviewClip || selectedClip(realState || {});
  const row = selectedEpisodeRow(realState || {});
  const videoDuration = Number(previewVideo?.duration || 0);
  const sourceDuration = Number(
    original?.source_duration
    || original?.episode_duration
    || row?.asset?.duration
    || row?.asset?.source_duration
    || row?.asset?.episode_duration
    || 0
  );
  const knownEnd = Math.max(Number(original?.end || 0), 1);
  const upperBound = Math.max(videoDuration, sourceDuration, knownEnd);
  const nextStart = Math.max(0, Math.min(start, upperBound - 0.5));
  const nextEnd = Math.max(nextStart + 0.5, Math.min(end, upperBound));
  return { start: Number(nextStart.toFixed(1)), end: Number(nextEnd.toFixed(1)) };
}

function timelineRail(trim = activeTrim()) {
  const videoDuration = previewVideo && Number.isFinite(previewVideo.duration) ? previewVideo.duration : 0;
  const sourceDuration = Number(trim.sourceClip?.source_duration || trim.sourceClip?.episode_duration || 0);
  const sourceStart = Math.max(0, Number(trim.sourceClip?.suggested_start ?? trim.sourceClip?.start ?? trim.start));
  const sourceEnd = Math.max(sourceStart + 1, Number(trim.sourceClip?.suggested_end ?? trim.sourceClip?.end ?? trim.end));
  const railStart = 0;
  const railEnd = Math.max(1, videoDuration, sourceDuration, trim.end, sourceEnd);
  return { start: railStart, end: railEnd, duration: Math.max(1, railEnd - railStart) };
}

function percentForTime(time, rail = timelineRail()) {
  return Math.max(0, Math.min(100, ((time - rail.start) / rail.duration) * 100));
}

function ensureDraftTrim() {
  const clip = activePreviewClip || selectedClip(realState || {});
  if (!clip) return null;
  const id = selectedClipKey(clip);
  if (!draftTrim || draftTrim.id !== id) {
    draftTrim = { id, start: Number(clip.start || 0), end: Number(clip.end || 0) };
  }
  return draftTrim;
}

function updatePreviewTransport() {
  if (!activePreviewClip) {
    if (previewCurrentTime) previewCurrentTime.textContent = "00:00";
    if (previewEndTime) previewEndTime.textContent = "00:00";
    if (previewProgress) previewProgress.value = "0";
    return;
  }
  const start = clipStart();
  const end = clipEnd();
  const actualTime = Math.max(0, Number(previewVideo?.currentTime || start));
  const current = Math.max(start, Math.min(end, actualTime));
  const duration = Math.max(0.1, end - start);
  const relativeCurrent = previewMode === "episode" ? current : Math.max(0, current - start);
  const progress = Math.round(((current - start) / duration) * 1000);
  if (previewCurrentTime) previewCurrentTime.textContent = formatClock(relativeCurrent);
  if (previewEndTime) previewEndTime.textContent = formatClock(duration);
  if (previewProgress) previewProgress.value = String(Math.max(0, Math.min(1000, progress)));
  updateTimelinePlayhead(actualTime);
}

function updateTrimUi() {
  const trim = activeTrim();
  const start = trim.start;
  const end = Math.max(start + 0.5, trim.end);
  const duration = Math.max(0.5, end - start);
  const rail = timelineRail(trim);
  const startPct = percentForTime(start, rail);
  const endPct = Math.max(startPct + 1, percentForTime(end, rail));
  if (reviewStartTime) reviewStartTime.textContent = formatSeconds(start);
  if (reviewEndTime) reviewEndTime.textContent = formatSeconds(end);
  if (timelineMeta) {
    timelineMeta.textContent = previewMode === "episode"
      ? `全片播放 · 当前${formatEpisodeLong(selectedEpisode)} · 时长 ${duration.toFixed(1)}s`
      : `开始 ${formatSeconds(start)} · 结束 ${formatSeconds(end)} · 时长 ${duration.toFixed(1)}s`;
  }
  if (selectedRange) {
    selectedRange.style.left = `${startPct}%`;
    selectedRange.style.right = `${100 - endPct}%`;
  }
  if (trimHandleStart) trimHandleStart.style.left = `${startPct}%`;
  if (trimHandleEnd) trimHandleEnd.style.left = `${endPct}%`;
  renderTimelineScale(rail);
  updatePreviewTransport();
}

function updateTimelinePlayhead(time = Number(previewVideo?.currentTime || 0)) {
  if (!timelinePlayhead) return;
  const left = percentForTime(time);
  timelinePlayhead.style.left = `${left}%`;
}

function setDraftTrim(start, end, seekTo = "start") {
  const draft = ensureDraftTrim();
  if (!draft) return;
  const clamped = clampTrim(start, end);
  draft.start = clamped.start;
  draft.end = clamped.end;
  updateTrimUi();
  syncTrimDecisionAvailability();
  if (realState) {
    renderSourceState(realState);
    syncReviewDraftMeta();
  }
  if (previewVideo) previewVideo.currentTime = seekTo === "end" ? Math.max(draft.start, draft.end - 0.6) : draft.start;
  updatePreviewTransport();
}

function nudgeTrim(which, delta) {
  const trim = activeTrim();
  const previous = which === "start" ? trim.start : trim.end;
  if (which === "start") setDraftTrim(trim.start + delta, trim.end, "start");
  if (which === "end") setDraftTrim(trim.start, trim.end + delta, "end");
  if (reviewRiskText) {
    const updated = activeTrim();
    const current = which === "start" ? updated.start : updated.end;
    const point = which === "start" ? "开始点" : "结束点";
    const direction = delta < 0 ? "向前" : "向后";
    reviewRiskText.textContent = Math.abs(current - previous) > 0.001
      ? `${point}已${direction}调整 ${Math.abs(current - previous).toFixed(1)} 秒。`
      : `${point}已到视频边界。`;
  }
}

function resetDraftTrim() {
  const clip = activePreviewClip || selectedClip(realState || {});
  if (!clip) return;
  draftTrim = { id: selectedClipKey(clip), start: Number(clip.start || 0), end: Number(clip.end || 0) };
  updateTrimUi();
  syncTrimDecisionAvailability();
  if (previewVideo) previewVideo.currentTime = draftTrim.start;
  updatePreviewTransport();
  if (reviewRiskText) reviewRiskText.textContent = "已还原为当前切片保存的开始/结束点。";
}

function discardDraftTrim() {
  draftTrim = null;
  const clip = activePreviewClip || selectedClip(realState || {});
  if (clip && previewVideo) previewVideo.currentTime = Number(clip.start || 0);
  updateTrimUi();
  syncTrimDecisionAvailability();
  if (realState) renderSourceState(realState);
  updatePreviewTransport();
  if (reviewRiskText) reviewRiskText.textContent = "已放弃本次未保存的边界修改。";
}

async function saveDraftTrim() {
  if (!realState) {
    if (reviewRiskText) reviewRiskText.textContent = "请先打开项目，再保存修改。";
    return;
  }
  if (!draftTrim) {
    if (reviewRiskText) reviewRiskText.textContent = "当前没有未保存的边界修改。";
    return;
  }
  const clip = selectedClip(realState);
  if (!clip || draftTrim.id !== selectedClipKey(clip)) {
    if (reviewRiskText) reviewRiskText.textContent = "当前没有可保存的候选切片。";
    return;
  }
  const pendingTrim = { start: draftTrim.start, end: draftTrim.end };
  const saveButton = document.querySelector("[data-trim-save]");
  const oldText = buttonLabel(saveButton, "保存修改");
  if (saveButton) {
    setButtonLabel(saveButton, "保存中");
    saveButton.disabled = true;
  }
  try {
    const result = await requestJson("/api/review", {
      method: "POST",
      body: JSON.stringify({
        id: clip.id,
        review_status: "changes_requested",
        reviewer: "Operator",
        ...pendingTrim,
      }),
    });
    mergeUpdatedClip(result.clip);
    selectedClipId = result.clip?.id || clip.id;
    if (saveButton) setButtonLabel(saveButton, "已保存");
  } catch (error) {
    if (saveButton) setButtonLabel(saveButton, "保存失败");
    if (reviewRiskText) reviewRiskText.textContent = `保存失败：${error.message || error}`;
    return;
  } finally {
    if (saveButton) {
      window.setTimeout(() => {
        setButtonLabel(saveButton, oldText || "保存修改");
        saveButton.disabled = false;
      }, 900);
    }
  }
  draftTrim = null;
  renderSourceState(realState);
  renderReviewState(realState);
  renderHomeState(realState);
  syncTrimDecisionAvailability();
}

function setReviewActionsBusy(isBusy, activeButton = null, text = "") {
  reviewActionButtons.forEach((button) => {
    setButtonDisabledReason(button, isBusy, "处理中，请稍等");
  });
  if (activeButton && text) setButtonLabel(activeButton, text);
}

function mergeUpdatedClip(updatedClip) {
  if (!updatedClip || !realState?.clips) return;
  const index = realState.clips.findIndex((clip) => clip.id === updatedClip.id);
  if (index >= 0) {
    realState.clips[index] = { ...realState.clips[index], ...updatedClip };
  }
}

async function updateReviewDecision(reviewStatus, button) {
  if (!realState) {
    if (reviewRiskText) reviewRiskText.textContent = "请先打开项目，再进行审片确认。";
    return;
  }
  const clip = selectedClip(realState);
  if (!clip?.id) {
    if (reviewRiskText) reviewRiskText.textContent = "当前没有可审片的候选。";
    return;
  }
  const labels = {
    approved: "确认可用",
    rejected: "不可用",
  };
  const doneLabels = {
    approved: "已确认",
    rejected: "已拒绝",
  };
  const pendingTrim = reviewStatus === "approved" && draftTrim && draftTrim.id === selectedClipKey(clip)
    ? { start: draftTrim.start, end: draftTrim.end }
    : null;
  const oldText = buttonLabel(button, labels[reviewStatus] || "更新");
  setReviewActionsBusy(true, button, pendingTrim ? "保存并确认" : "处理中");
  try {
    const result = await requestJson("/api/review", {
      method: "POST",
      body: JSON.stringify({
        id: clip.id,
        review_status: reviewStatus,
        reviewer: "Operator",
        ...(pendingTrim ? pendingTrim : {}),
      }),
    });
    mergeUpdatedClip(result.clip);
    selectedClipId = result.clip?.id || clip.id;
    draftTrim = null;
    syncTrimDecisionAvailability();
    renderHomeState(realState);
    if (button) setButtonLabel(button, doneLabels[reviewStatus] || "已更新");
  } catch (error) {
    if (button) setButtonLabel(button, "更新失败");
    if (reviewRiskText) reviewRiskText.textContent = `确认失败：${error.message || error}`;
  } finally {
    window.setTimeout(() => {
      if (button) setButtonLabel(button, oldText);
      setReviewActionsBusy(false);
      renderReviewState(realState);
    }, 900);
  }
}

async function runAiReselect(button) {
  if (!realState) {
    if (reviewRiskText) reviewRiskText.textContent = "请先打开项目，再使用 AI 重选。";
    return;
  }
  const clip = selectedClip(realState);
  if (!clip?.id) {
    if (reviewRiskText) reviewRiskText.textContent = "当前没有可重选的候选。";
    return;
  }
  const oldText = buttonLabel(button, "AI 重选本条");
  if (button) {
    button.disabled = true;
    setButtonLabel(button, "重选中");
  }
  if (reviewRiskText) reviewRiskText.textContent = "正在重新切片当前片段。";
  try {
    const generated = await requestJson("/api/ai-reselect", {
      method: "POST",
      body: JSON.stringify({
        id: clip.id,
        intent: "complete",
      }),
    });
    const candidates = generated.candidates || [];
    if (!candidates.length) throw new Error("没有生成可用候选");
    const firstCandidate = candidates[0];
    const applied = await requestJson("/api/ai-reselect", {
      method: "POST",
      body: JSON.stringify({
        id: clip.id,
        candidate_id: firstCandidate.id || firstCandidate.key || "",
        intent: "complete",
      }),
    });
    mergeUpdatedClip(applied.clip || generated.clip);
    selectedClipId = applied.clip?.id || generated.clip?.id || clip.id;
    const updatedClip = selectedClip(realState || {}) || applied.clip || generated.clip || clip;
    draftTrim = {
      id: selectedClipKey(updatedClip),
      start: Number(updatedClip.start || 0),
      end: Number(updatedClip.end || 0),
    };
    syncTrimDecisionAvailability();
    renderHomeState(realState);
    if (button) setButtonLabel(button, "已重切");
    const review = applied.model_review || generated.model_review || generated.clip?.ai_candidate_review || {};
    const modelName = review.model || generated.model || "规则算法";
    const summary = review.summary || "已重新切片当前片段，请预览后保存或确认。";
    if (reviewRiskText) reviewRiskText.textContent = `${modelName}：${summary}`;
  } catch (error) {
    if (button) setButtonLabel(button, "重选失败");
    if (reviewRiskText) reviewRiskText.textContent = `AI 重选失败：${error.message || error}`;
  } finally {
    window.setTimeout(() => {
      if (button) {
        setButtonLabel(button, oldText);
        button.disabled = false;
      }
      renderReviewState(realState);
    }, 1200);
  }
}

function videoUrlForClip(clip) {
  const path = clip?.preview_video || clip?.source_video || "";
  return path ? `/preview-video?path=${encodeURIComponent(path)}` : "";
}

function setVideoPlaceholder(message = "", visible = true) {
  if (!videoPlaceholder) return;
  videoPlaceholder.textContent = message || "选择剧集或切片开始预览";
  videoPlaceholder.hidden = !visible;
}

function pausePreview() {
  if (previewVideo) previewVideo.pause();
  isPlaying = false;
  playButton?.classList.remove("is-playing");
  playButton?.setAttribute("aria-label", "播放");
}

function syncVideoOrientation() {
  if (!previewVideo || !previewVideo.videoWidth || !previewVideo.videoHeight) return;
  const isPortrait = previewVideo.videoHeight > previewVideo.videoWidth;
  body.dataset.orientation = isPortrait ? "portrait" : "landscape";
  if (formatPill) formatPill.textContent = isPortrait ? "9:16 竖屏" : "16:9 横屏";
}

function previewItemMatchesPath(item, sourcePath) {
  return item?.path && sourcePath && item.path === sourcePath;
}

async function ensurePreviewReadyForPath(sourcePath, token) {
  if (!sourcePath) return false;
  const statusUrl = `/api/preview-cache/status?path=${encodeURIComponent(sourcePath)}`;
  let status = await requestJson(statusUrl);
  let item = (status.items || []).find((entry) => previewItemMatchesPath(entry, sourcePath));
  if (!item || item.direct || item.ready) return true;

  setVideoPlaceholder("正在准备可播放预览", true);
  if (sourceHint) sourceHint.textContent = "正在准备可播放预览。";
  const job = await requestJson("/api/preview-cache/start", { method: "POST", body: JSON.stringify({}) });
  previewCacheJobId = job.id || previewCacheJobId || "";
  const startedAt = Date.now();
  while (Date.now() - startedAt < 240000) {
    if (token !== previewLoadToken) return false;
    status = await requestJson(statusUrl);
    item = (status.items || []).find((entry) => previewItemMatchesPath(entry, sourcePath));
    if (!item || item.direct || item.ready) {
      if (sourceHint) sourceHint.textContent = "视频预览已准备好。";
      return true;
    }
    if (previewCacheJobId) {
      try {
        const latestJob = await requestJson(`/api/preview-cache/task?id=${encodeURIComponent(previewCacheJobId)}`);
        if (sourceHint && latestJob?.message) {
          const progress = Number(latestJob.progress || 0);
          sourceHint.textContent = progress > 0 ? `${latestJob.message} · ${progress}%` : latestJob.message;
        }
      } catch (_) {
        // The status endpoint above is the source of truth for the selected video.
      }
    }
    await delay(1200);
  }
  throw new Error("视频预览准备超时");
}

async function loadPreviewClip(clip, mode = "clip") {
  if (!previewVideo) return;
  const token = ++previewLoadToken;
  activePreviewClip = clip || null;
  previewMode = mode;
  if (!clip) {
    pausePreview();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    setVideoPlaceholder("选择剧集或切片开始预览", true);
    updatePreviewTransport();
    return;
  }
  const sourcePath = clip?.preview_video || clip?.source_video || "";
  const src = videoUrlForClip(clip);
  if (!src) {
    pausePreview();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    setVideoPlaceholder("当前素材没有可播放路径", true);
    updatePreviewTransport();
    return;
  }
  const sourceChanged = previewVideo.getAttribute("src") !== src;
  if (sourceChanged) {
    pausePreview();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    setVideoPlaceholder(`正在加载第 ${clip.episode || selectedEpisode} 集`, true);
    updatePreviewTransport();
    try {
      const ready = await ensurePreviewReadyForPath(sourcePath, token);
      if (!ready || token !== previewLoadToken) return;
    } catch (error) {
      if (token !== previewLoadToken) return;
      setVideoPlaceholder(error.message || "视频预览准备失败", true);
      updatePreviewTransport();
      return;
    }
    if (token !== previewLoadToken) return;
    previewVideo.setAttribute("src", src);
    previewVideo.load();
  }
  const start = mode === "episode" ? 0 : Number(clip.start || 0);
  if (Number.isFinite(start)) previewVideo.currentTime = Math.max(0, start);
  updatePreviewTransport();
  updateTrimUi();
}

function qualityStatusLabel(status) {
  if (status === "PASS") return "质量通过";
  if (status === "BLOCKED") return "暂不通过";
  if (status === "REVIEW") return "需复核";
  return "待检查";
}

function riskCodeLabel(code) {
  const labels = {
    not_confirmed: "未确认",
    subtitle_boundary_unknown: "缺少字幕校验",
    dialogue_cut_risk: "对白边界风险",
    weak_boundary_evidence: "边界证据弱",
    no_scene_anchor: "缺少场景锚点",
  };
  return labels[code] || String(code || "").replace(/_/g, " ");
}

function currentReviewClip() {
  return selectedClip(realState || {});
}

function reviewBoundaryMessage(clip = currentReviewClip()) {
  if (!clip) return "暂无切片";
  if (clipStatusClass(clip) === "warning") return "当前正在修改。";
  const start = Number(clip.start || 0).toFixed(1);
  const end = Number(clip.end || 0).toFixed(1);
  return `边界 ${start}-${end} 秒；可微调入点/出点后保存。`;
}

function reviewRiskMessage(quality = latestReviewQuality, clip = currentReviewClip()) {
  if (!clip) return "暂无切片";
  if (!quality) return "风险信息读取中；可先检查边界和字幕完整性。";
  const summary = quality.summary || {};
  const boundary = quality.boundary_score || {};
  const readiness = quality.readiness || {};
  const risks = (quality.risks || readiness.risks || []).map(riskCodeLabel).slice(0, 3);
  const status = qualityStatusLabel(quality.status);
  const score = Number.isFinite(Number(summary.boundary_score ?? boundary.score)) ? `边界 ${summary.boundary_score ?? boundary.score} 分` : "边界待检查";
  const subtitle = summary.subtitle_available || quality.dialogue?.available ? "字幕已参与校验" : "字幕未参与校验";
  return `${status} · ${score} · ${subtitle}；${risks.length ? `风险：${risks.join("、")}` : "暂无明显风险"}`;
}

function reviewHistoryMessage(clip = currentReviewClip()) {
  if (!clip) return "暂无记录";
  const statusText = clipStatusText(clip);
  const exported = clip.exported_at ? "已导出" : "未导出";
  const updated = clip.updated_at || clip.reviewed_at || clip.created_at || "";
  return `${clip.id || "当前候选"} · ${statusText} · ${exported}${updated ? ` · 最近更新 ${updated}` : ""}`;
}

function renderAiCandidates(clip = currentReviewClip()) {
  if (!aiCandidateCard || !aiCandidateList) return;
  selectedAiCandidateId = "";
  aiCandidateCard.hidden = true;
  aiCandidateList.innerHTML = "";
  if (aiCandidateMeta) aiCandidateMeta.textContent = "";
}

function syncReviewDraftMeta() {
  const clip = selectedClip(realState || {});
  if (!clip) return;
  const displayClip = clipWithDraftStatus(clip);
  const statusText = clipStatusText(displayClip);
  const duration = Number(displayClip.duration || Math.max(0, Number(displayClip.end || 0) - Number(displayClip.start || 0))).toFixed(1);
  if (reviewCandidateMeta) reviewCandidateMeta.textContent = `${duration} 秒 · ${statusText}`;
}

function renderReviewQuality(quality) {
  if (!reviewRiskText || !quality) return;
  latestReviewQuality = quality;
}

async function loadReviewQuality(clip) {
  const requestId = ++reviewQualityRequestId;
  if (!clip?.id) return;
  try {
    const quality = await requestJson(`/api/clip/quality-gate?id=${encodeURIComponent(clip.id)}`);
    if (requestId !== reviewQualityRequestId) return;
    renderReviewQuality(quality);
  } catch (error) {
    if (requestId !== reviewQualityRequestId) return;
    if (reviewRiskText) reviewRiskText.textContent = `质量检查读取失败：${error.message || error}`;
  }
}

function renderReviewState(state) {
  if (previewMode === "episode") {
    const episodeClip = episodePreviewClip(state);
    if (episodeClip) {
      const duration = Number(episodeClip.duration || 0);
      if (reviewCandidateTitle) reviewCandidateTitle.textContent = `${formatEpisode(selectedEpisode)} · 原片预览`;
      if (reviewCandidateMeta) reviewCandidateMeta.textContent = duration ? `整集 · ${formatClock(duration)}` : "整集时间线";
      loadEpisodePreview(state);
      return;
    }
  }
  const clip = selectedClip(state);
  if (!clip) {
    latestReviewQuality = null;
    if (reviewCandidateTitle) reviewCandidateTitle.textContent = "暂无切片";
    if (reviewCandidateMeta) reviewCandidateMeta.textContent = "";
    renderAiCandidates(null);
    syncReviewActionAvailability(false, "没有可审候选");
    loadPreviewClip(null);
    return;
  }
  syncReviewActionAvailability(true, "");
  const displayClip = clipWithDraftStatus(clip);
  const statusText = clipStatusText(displayClip);
  const duration = Number(displayClip.duration || Math.max(0, Number(displayClip.end || 0) - Number(displayClip.start || 0))).toFixed(1);
  const selectionLabel = `${formatEpisodeLong(clip.episode)} · ${clip.id || "候选"}`;
  latestReviewQuality = null;
  if (reviewCandidateTitle) reviewCandidateTitle.textContent = `${formatEpisodeLong(clip.episode)} · ${clip.id || "候选"}`;
  if (reviewCandidateMeta) reviewCandidateMeta.textContent = `${duration} 秒 · ${statusText}`;
  renderAiCandidates(clip);
  if (monitorMode) monitorMode.textContent = "候选片段监视器";
  monitorTitle.textContent = selectionLabel;
  loadPreviewClip(clip, "clip");
  updateTrimUi();
  syncTrimDecisionAvailability();
  loadReviewQuality(clip);
}

function setButtonDisabledReason(button, disabled, reason = "") {
  if (!button) return;
  button.disabled = Boolean(disabled);
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
  if (disabled && reason) {
    button.title = reason;
  } else {
    button.removeAttribute("title");
  }
}

function buttonLabel(button, fallback = "") {
  if (!button) return fallback;
  const text = [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join("")
    .trim();
  const label = text || button.textContent || fallback;
  return String(label)
    .replace(/^[\s✓✔↻⟳×!！＋+▶⏸⏹📁]+/u, "")
    .trim() || fallback;
}

function setButtonLabel(button, label) {
  if (!button) return;
  const icon = button.querySelector('span[aria-hidden="true"]');
  if (icon) {
    const textNodes = [...button.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    let textNode = textNodes[0];
    if (!textNode) {
      textNode = document.createTextNode("");
      button.appendChild(textNode);
    }
    textNodes.slice(1).forEach((node) => node.remove());
    textNode.textContent = label;
    return;
  }
  button.textContent = label;
}

function hasActiveDraftTrim() {
  const clip = selectedClip(realState || {});
  return Boolean(draftTrim && clip && draftTrim.id === selectedClipKey(clip));
}

function syncTrimDecisionAvailability() {
  const hasDraft = hasActiveDraftTrim();
  if (trimDecisionPanel) trimDecisionPanel.hidden = !hasDraft;
  aiReselectGroup?.classList.toggle("active", hasDraft);
  document.querySelectorAll("[data-trim-save], [data-trim-discard]").forEach((button) => {
    setButtonDisabledReason(button, !hasDraft, hasDraft ? "" : "当前没有未保存修改");
  });
}

function setMediaImportStatus(summary, detail, isGood = false) {
  if (mediaImportSummary) mediaImportSummary.textContent = summary;
  if (mediaImportDetail) mediaImportDetail.textContent = detail;
  const card = mediaImportSummary?.closest(".status-card");
  if (card) card.classList.toggle("good", Boolean(isGood));
}

function syncReviewActionAvailability(canReview, reason = "") {
  reviewActionButtons.forEach((button) => setButtonDisabledReason(button, !canReview, reason));
  setButtonDisabledReason(aiReselectButton, !canReview, reason);
}

function exportTask(state) {
  return (state.tasks || []).find((task) => task.key === "export_clips") || {};
}

function episodeExportRows(state) {
  const episodes = new Map();
  (state.clips || []).forEach((clip) => {
    const episode = String(clip.episode || 1);
    if (!episodes.has(episode)) episodes.set(episode, []);
    episodes.get(episode).push(clip);
  });
  return [...episodes.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function exportPreviewMessage(message) {
  const text = String(message || "");
  if (!text) return "";
  if (text === "No active project.") return "还没有选择项目。";
  if (text === "No clips generated yet.") return "还没有生成候选切片。";
  if (text === "No confirmed clips are available for export.") return "还没有确认可用片段。";
  const targetGap = text.match(/Target gap remains:\s*(\d+)\s*READY clip/);
  if (targetGap) return `距离目标还差 ${targetGap[1]} 条可交付片段。`;
  const rework = text.match(/(\d+)\s*clip\(s\) still need review or repair/);
  if (rework) return `${rework[1]} 条片段仍需复核或修边界。`;
  if (text.includes("No READY clips are available")) return "暂无安全交付片段；已确认片段仍可由你确认后导出。";
  return text;
}

function previewEpisodeMap(preview) {
  const map = new Map();
  (preview?.episodes || []).forEach((episode) => {
    map.set(String(episode.episode || 1), episode);
  });
  return map;
}

function renderExportEpisodeList(state, preview = null) {
  if (!exportEpisodeList) return;
  const rows = episodeExportRows(state);
  const episodeStats = previewEpisodeMap(preview);
  exportEpisodeList.innerHTML = rows.length ? rows.map(([episode, episodeClips]) => {
    const stats = episodeStats.get(String(episode)) || {};
    const episodeConfirmed = Number(stats.confirmed ?? approvedClipCount(episodeClips));
    const episodeExported = episodeClips.filter((clip) => clip.exported_at).length;
    const episodePending = Number(stats.not_exported ?? Math.max(0, episodeConfirmed - episodeExported));
    const ready = Number(stats.ready ?? episodePending);
    const rework = Number(stats.rework ?? 0);
    const failed = Number(stats.failed || 0);
    const status = failed ? `失败 ${failed}` : episodePending ? `待导出 ${episodePending}` : episodeConfirmed ? "已完成" : "需审片";
    const detail = [`已确认 ${episodeConfirmed}`, `已导出 ${episodeExported}`, `可交付 ${ready}`, `需复核 ${rework}`];
    return `
      <button class="delivery-row ${String(episode) === String(selectedEpisode) ? "active" : ""}" type="button" data-export-episode="${escapeHtml(episode)}">
        <strong>${escapeHtml(formatEpisodeLong(episode, state))} · ${status}</strong>
        <span>${detail.join(" · ")}</span>
      </button>
    `;
  }).join("") : `<div class="empty-state">暂无可导出片段</div>`;
}

function exportDeliverySummary({ exportable, confirmed, exported, blocker = "" } = {}) {
  if (blocker) return `暂不能导出：${blocker}`;
  return `可导出 ${Number(exportable || 0)} 条 · 已确认 ${Number(confirmed || 0)} 条 · 已导出 ${Number(exported || 0)} 条`;
}

function applyExportPreview(preview, state) {
  const blockers = preview?.blockers || [];
  const checklist = preview?.checklist || [];
  const warnings = preview?.warnings || [];
  if (exportConfirmedCount && Number.isFinite(Number(preview?.confirmed_count))) exportConfirmedCount.textContent = String(preview.confirmed_count);
  if (exportPendingCount && Number.isFinite(Number(preview?.not_exported_count))) exportPendingCount.textContent = String(preview.not_exported_count);
  if (exportFailedCount && Number.isFinite(Number(preview?.failed_count))) exportFailedCount.textContent = String(preview.failed_count);
  if (exportDeliveryNote) {
    const passedChecks = checklist.filter((item) => item?.ok).length;
    const checkText = checklist.length ? ` · 检查 ${passedChecks}/${checklist.length}` : "";
    if (blockers.length) {
      exportDeliveryNote.textContent = `${exportDeliverySummary({ blocker: exportPreviewMessage(blockers[0]) })}${checkText}`;
    } else if (warnings.length) {
      exportDeliveryNote.textContent = `${exportDeliverySummary({
        exportable: preview.exportable_count,
        confirmed: preview.confirmed_count,
        exported: preview.exported_count,
      })} · 提醒：${exportPreviewMessage(warnings[0])}${checkText}`;
    } else {
      exportDeliveryNote.textContent = `${exportDeliverySummary({
        exportable: preview.exportable_count,
        confirmed: preview.confirmed_count,
        exported: preview.exported_count,
      })}${checkText}`;
    }
  }
  renderExportEpisodeList(state || realState || {}, preview);
}

async function loadExportPreview(state) {
  const requestId = ++exportPreviewRequestId;
  try {
    const preview = await exportPreviewFor("all");
    if (requestId !== exportPreviewRequestId) return;
    applyExportPreview(preview, state || realState || {});
  } catch (error) {
    if (requestId !== exportPreviewRequestId) return;
    if (exportDeliveryNote) exportDeliveryNote.textContent = `导出检查读取失败：${error.message || error}`;
  }
}

function renderExportState(state) {
  const clips = state.clips || [];
  const confirmed = approvedClipCount(clips);
  const exported = clips.filter((clip) => clip.exported_at).length;
  const failed = clips.filter((clip) => clip.export_status === "failed" || clip.export_error || clip.export_failed_at).length;
  const pending = Math.max(0, confirmed - exported);
  const task = exportTask(state);
  const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
  if (exportConfirmedCount) exportConfirmedCount.textContent = String(confirmed);
  if (exportPendingCount) exportPendingCount.textContent = String(pending);
  if (exportFailedCount) exportFailedCount.textContent = String(failed);
  if (exportOutputDirInput) exportOutputDirInput.value = state.output_dir || "";
  const isActiveTask = ["pending", "running"].includes(task.status);
  setExportProgressVisible(isActiveTask);
  if (exportProgressLabel) exportProgressLabel.textContent = task.label || "导出任务";
  if (exportProgressText) exportProgressText.textContent = `${progress}%`;
  if (exportProgressBar) exportProgressBar.style.width = `${progress}%`;
  if (exportTaskText) exportTaskText.textContent = task.message || "选择导出范围后开始生成 MP4。";
  if (exportDeliveryNote) {
    exportDeliveryNote.textContent = exportDeliverySummary({
      exportable: pending,
      confirmed,
      exported,
    });
  }
  exportActionButtons.forEach((button) => {
    const scope = button.dataset.exportScope;
    const canExportAll = confirmed > 0;
    const canExportEpisode = currentClips(state).some((clip) => clip.status === "confirmed");
    const currentClip = selectedClip(state);
    const canExportClip = Boolean(currentClip && currentClip.status === "confirmed");
    const disabled = scope === "clip" ? !canExportClip : (scope === "episode" ? !canExportEpisode : !canExportAll);
    const reason = scope === "clip"
      ? "当前切片未确认"
      : (scope === "episode" ? "当前集没有已确认片段" : "还没有已确认片段");
    button.classList.toggle("is-available", !disabled);
    button.classList.toggle("is-unavailable", disabled);
    setButtonDisabledReason(button, disabled, reason);
  });
  renderExportEpisodeList(state);
  loadExportPreview(state);
}

function setExportProgress(label, progress, message) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  setExportProgressVisible(false);
  if (exportProgressLabel) exportProgressLabel.textContent = label;
  if (exportProgressText) exportProgressText.textContent = `${safeProgress}%`;
  if (exportProgressBar) exportProgressBar.style.width = `${safeProgress}%`;
  if (exportTaskText) exportTaskText.textContent = message;
  if (exportDeliveryNote) exportDeliveryNote.textContent = `${label} ${safeProgress}%：${message}`;
}

function setExportProgressVisible(isVisible) {
  if (exportProgressCard) exportProgressCard.hidden = !isVisible;
}

function setExportActionsBusy(isBusy) {
  exportActionButtons.forEach((button) => {
    setButtonDisabledReason(button, isBusy, "导出中，请等待当前任务完成");
  });
}

async function refreshState() {
  const state = await requestJson("/api/state");
  realState = state;
  renderHomeState(state);
  loadProjectList();
  return state;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function warmPreviewCacheIfNeeded() {
  if (!realState?.assets?.length || previewCachePolling) return;
  try {
    const status = await requestJson("/api/preview-cache/status");
    if (status?.pending > 0 && status?.needs_proxy > 0) {
      if (sourceHint) sourceHint.textContent = `正在准备 ${status.pending} 集可播放预览。`;
      const job = await requestJson("/api/preview-cache/start", { method: "POST", body: JSON.stringify({}) });
      previewCacheJobId = job.id || "";
      if (previewCacheJobId) pollPreviewCacheJob(previewCacheJobId);
    } else if (status?.needs_proxy > 0 && sourceHint) {
      sourceHint.textContent = "视频预览已准备好。";
    }
  } catch (_) {
    if (sourceHint && !sourceHint.textContent) sourceHint.textContent = "";
  }
}

async function pollPreviewCacheJob(jobId) {
  if (!jobId || previewCachePolling) return;
  previewCachePolling = true;
  try {
    while (true) {
      const job = await requestJson(`/api/preview-cache/task?id=${encodeURIComponent(jobId)}`);
      if (sourceHint) {
        const progress = Number(job.progress || 0);
        sourceHint.textContent = job.status === "running"
          ? `${job.message || "正在准备可播放预览"} · ${progress}%`
          : (job.message || "");
      }
      if (!["pending", "running"].includes(job.status)) {
        if (job.result?.state) {
          realState = job.result.state;
          renderHomeState(realState);
        }
        break;
      }
      await delay(1200);
    }
  } catch (error) {
    if (sourceHint) sourceHint.textContent = `预览准备失败：${error.message || error}`;
  } finally {
    previewCachePolling = false;
  }
}

function defaultProjectName() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `短剧切片_${stamp}`;
}

if (newProjectNameInput && !newProjectNameInput.value) {
  newProjectNameInput.placeholder = defaultProjectName();
}

async function createProject() {
  const name = (newProjectNameInput?.value || defaultProjectName()).trim();
  if (!name) return;
  if (homeProjectDesc) homeProjectDesc.textContent = "正在新建项目。";
  try {
    const result = await requestJson("/api/project/new", {
      method: "POST",
      body: JSON.stringify({
        project_name: name,
        drama_name: name,
        episode_scope: "前10集",
        template_id: "first_10",
      }),
    });
    realState = result;
    if (newProjectNameInput) newProjectNameInput.value = "";
    renderHomeState(result);
    loadProjectList();
    openWorkbench("media");
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `新建失败：${error.message || error}`;
  }
}

async function loadProject(baseDir, statePath) {
  if (homeProjectDesc) homeProjectDesc.textContent = "正在打开项目。";
  try {
    const state = await requestJson("/api/project/load", {
      method: "POST",
      body: JSON.stringify({ base_dir: baseDir || "", state_path: statePath || "" }),
    });
    realState = state;
    selectedEpisode = "1";
    selectedClipId = "";
    draftTrim = null;
    renderHomeState(state);
    loadProjectList();
    openWorkbench("media");
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `打开失败：${error.message || error}`;
  }
}

async function deleteProject(baseDir, statePath) {
  const ok = await confirmAction({
    title: "删除项目？",
    message: "项目会移入回收区，可在最近项目里恢复。",
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  try {
    await requestJson("/api/project/delete", {
      method: "POST",
      body: JSON.stringify({ base_dir: baseDir || "", state_path: statePath || "" }),
    });
    await refreshState();
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `删除失败：${error.message || error}`;
  }
}

async function restoreProject(trashPath) {
  if (!trashPath) return;
  const ok = await confirmAction({
    title: "恢复项目？",
    message: "恢复后可在最近项目中继续打开。",
    confirmText: "恢复",
  });
  if (!ok) return;
  if (homeProjectDesc) homeProjectDesc.textContent = "正在恢复项目。";
  try {
    await requestJson("/api/project/restore", {
      method: "POST",
      body: JSON.stringify({ trash_path: trashPath }),
    });
    await loadProjectList();
    if (homeProjectDesc) homeProjectDesc.textContent = "项目已恢复，可在最近项目中打开。";
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `恢复失败：${error.message || error}`;
  }
}

async function purgeDeletedProject(trashPath, projectName = "已删除项目") {
  if (!trashPath) return;
  const ok = await confirmAction({
    title: "彻底删除项目？",
    message: `${projectName} 将从回收区永久删除，删除后不可恢复。`,
    confirmText: "彻底删除",
    danger: true,
  });
  if (!ok) return;
  if (homeProjectDesc) homeProjectDesc.textContent = "正在彻底删除项目。";
  try {
    await requestJson("/api/project/purge", {
      method: "POST",
      body: JSON.stringify({ trash_path: trashPath }),
    });
    await loadProjectList();
    if (homeProjectDesc) homeProjectDesc.textContent = "项目已彻底删除。";
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `彻底删除失败：${error.message || error}`;
  }
}

async function renameProject() {
  if (!realState) {
    if (homeProjectDesc) homeProjectDesc.textContent = "请先打开项目。";
    return;
  }
  const currentName = realState.project_name || "";
  const nextName = await promptProjectName(currentName);
  if (!nextName || nextName === currentName) return;
  try {
    const result = await requestJson("/api/project/rename", {
      method: "POST",
      body: JSON.stringify({ project_name: nextName }),
    });
    realState = result.state || result;
    renderHomeState(realState);
    loadProjectList();
    if (homeProjectDesc) homeProjectDesc.textContent = "项目名已更新。";
  } catch (error) {
    if (homeProjectDesc) homeProjectDesc.textContent = `重命名失败：${error.message || error}`;
  }
}

async function deleteAsset(assetPath) {
  if (!assetPath) return;
  const ok = await confirmAction({
    title: "删除素材？",
    message: "相关切片会标记为不可用。",
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  if (clipStatusDetail) clipStatusDetail.textContent = "正在删除素材。";
  try {
    const result = await requestJson("/api/assets/delete", {
      method: "POST",
      body: JSON.stringify({ path: assetPath }),
    });
    realState = result.state;
    renderHomeState(realState);
    openWorkbench("media");
  } catch (error) {
    if (clipStatusDetail) clipStatusDetail.textContent = `删除失败：${error.message || error}`;
  }
}

async function restoreAsset(trashPath, originalPath) {
  if (!trashPath || !originalPath) return;
  const ok = await confirmAction({
    title: "恢复素材？",
    message: "恢复后相关切片会重新可用。",
    confirmText: "恢复",
  });
  if (!ok) return;
  if (clipStatusDetail) clipStatusDetail.textContent = "正在恢复素材。";
  try {
    const result = await requestJson("/api/assets/restore", {
      method: "POST",
      body: JSON.stringify({ trash_path: trashPath, original_path: originalPath }),
    });
    realState = result.state;
    renderHomeState(realState);
    openWorkbench("media");
  } catch (error) {
    if (clipStatusDetail) clipStatusDetail.textContent = `恢复失败：${error.message || error}`;
  }
}

async function deleteClip(clipId) {
  if (!clipId) return;
  const ok = await confirmAction({
    title: "删除切片？",
    message: "这条切片会从当前列表移除，原视频素材不会被删除。",
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  if (reviewRiskText) reviewRiskText.textContent = "正在删除切片。";
  try {
    const result = await requestJson("/api/clips/delete", {
      method: "POST",
      body: JSON.stringify({ id: clipId }),
    });
    realState = result.state || realState;
    selectedClipId = "";
    renderHomeState(realState);
    openWorkbench("review");
  } catch (error) {
    if (reviewRiskText) reviewRiskText.textContent = `删除失败：${error.message || error}`;
  }
}

async function uploadAssets(files) {
  if (!files?.length) return;
  const form = new FormData();
  [...files].forEach((file) => form.append("files", file));
  const oldText = buttonLabel(importAssetsButton, "导入视频素材");
  const totalSize = [...files].reduce((sum, file) => sum + Number(file.size || 0), 0);
  const totalSizeLabel = `${(totalSize / 1024 / 1024).toFixed(1)} MB`;
  if (importAssetsButton) {
    importAssetsButton.disabled = true;
    setButtonLabel(importAssetsButton, "导入中…");
  }
  setMediaImportStatus("正在导入素材", `${files.length} 个文件，约 ${totalSizeLabel}。大文件请等待，不要重复点击。`);
  if (clipStatusDetail) clipStatusDetail.textContent = `正在导入 ${files.length} 个素材。`;
  try {
    const response = await fetch("/api/assets/upload", { method: "POST", body: form });
    if (!response.ok) throw new Error(`导入失败：${response.status}`);
    const result = await response.json();
    realState = result.state;
    renderHomeState(realState);
    setMediaImportStatus("导入完成", `已导入 ${result.uploaded?.length || files.length} 个素材，素材区已刷新。`, true);
    openWorkbench("media");
  } catch (error) {
    setMediaImportStatus("导入失败", error.message || "导入失败，请检查文件格式、磁盘空间或服务状态。");
    if (clipStatusDetail) clipStatusDetail.textContent = error.message || "导入失败";
  } finally {
    if (importAssetsButton) {
      setButtonLabel(importAssetsButton, oldText || "导入视频素材");
      importAssetsButton.disabled = false;
    }
    if (assetUploadInput) assetUploadInput.value = "";
  }
}

function selectedAssetPath() {
  const row = episodeRows(realState || {}).find((item) => String(item.episode) === String(selectedEpisode));
  return row?.asset?.path || "";
}

async function importSubtitle(files) {
  if (!files?.length || !realState) return;
  const assetPath = selectedAssetPath();
  if (!assetPath) {
    if (clipStatusDetail) clipStatusDetail.textContent = "请先选择要匹配字幕的剧集。";
    return;
  }
  const form = new FormData();
  form.append("asset_path", assetPath);
  form.append("file", files[0]);
  if (clipStatusDetail) clipStatusDetail.textContent = "正在导入本集字幕。";
  try {
    const response = await fetch("/api/subtitles/import", { method: "POST", body: form });
    if (!response.ok) throw new Error(`字幕导入失败：${response.status}`);
    const result = await response.json();
    realState = result.state;
    renderHomeState(realState);
    setSubtitleMode("srt");
    await refreshSubtitleGate();
    if (clipStatusDetail) clipStatusDetail.textContent = `字幕已导入：${result.segments || 0} 条对白线索。`;
    if (subtitleSrtStatus) {
      subtitleSrtStatus.textContent = `已导入本集字幕：${result.segments || 0} 条对白线索。`;
      subtitleSrtStatus.classList.add("good");
      subtitleSrtStatus.classList.remove("warning");
    }
  } catch (error) {
    if (clipStatusDetail) clipStatusDetail.textContent = error.message || "字幕导入失败";
    if (subtitleSrtStatus) {
      subtitleSrtStatus.textContent = error.message || "字幕导入失败";
      subtitleSrtStatus.classList.add("warning");
      subtitleSrtStatus.classList.remove("good");
    }
  } finally {
    if (srtUploadInput) srtUploadInput.value = "";
  }
}

async function pollTranscriptJob(jobId, maxRounds = 180) {
  for (let round = 0; round < maxRounds; round += 1) {
    const job = await requestJson(`/api/transcript/task?id=${encodeURIComponent(jobId)}`);
    const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
    if (clipProgressLabel) clipProgressLabel.textContent = "准备字幕";
    if (clipProgressText) clipProgressText.textContent = `${progress}%`;
    if (clipProgressBar) clipProgressBar.style.width = `${progress}%`;
    if (clipStatusDetail) clipStatusDetail.textContent = "";
    if (job.status === "done") return job;
    if (job.status === "error") throw new Error(job.message || job.error || "字幕识别失败");
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error("字幕识别任务超时，请稍后刷新查看。");
}

async function waitForSubtitleGateReady(maxRounds = 8) {
  for (let round = 0; round < maxRounds; round += 1) {
    await refreshState();
    const gate = await refreshSubtitleGate();
    if (gate?.can_start) return gate;
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  }
  return latestSubtitleGate;
}

async function ensureSubtitlesBeforeClipping(gate, selectedEpisodes) {
  if (gate?.can_start) {
    return await refreshSubtitleGate();
  }
  const cloud = gate?.cloud_asr || {};
  if (!cloud.ready) return gate;
  const missingEpisodes = (gate.missing || []).map((item) => Number(item.episode)).filter(Number.isFinite);
  const episodes = missingEpisodes.length ? missingEpisodes : selectedEpisodes;
  if (!episodes.length) return gate;
  setSubtitleStatusBadge(subtitleAsrStatus, "字幕生成中", "working");
  setSubtitleStatusBadge(subtitleApiReadyLabel, "生成中", "working");
  if (clipStatusDetail) clipStatusDetail.textContent = "";
  isSubtitlePreparationActive = true;
  const job = await requestJson("/api/transcript/queue-start", {
    method: "POST",
    body: JSON.stringify({ episodes, include_existing: false }),
  });
  try {
    await pollTranscriptJob(job.id, Math.max(180, episodes.length * 120));
  } catch (error) {
    isSubtitlePreparationActive = false;
    setSubtitleStatusBadge(subtitleAsrStatus, "生成失败", "missing");
    setSubtitleStatusBadge(subtitleApiReadyLabel, "失败", "missing");
    if (clipProgressLabel) clipProgressLabel.textContent = "字幕识别";
    if (clipProgressText) clipProgressText.textContent = "失败";
    if (clipProgressBar) clipProgressBar.style.width = "100%";
    if (clipStatusDetail) clipStatusDetail.textContent = error.message || "字幕生成失败，请重试。";
    await refreshSubtitleGate();
    return latestSubtitleGate || gate;
  }
  const nextGate = await waitForSubtitleGateReady();
  isSubtitlePreparationActive = false;
  if (nextGate?.can_start && clipStatusDetail) clipStatusDetail.textContent = "";
  return nextGate;
}

async function pollClippingJob(jobId, maxRounds = 1800) {
  let consecutiveFailures = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const lookupId = jobId || activeClippingJobId || lastClippingJobId || "latest";
    let job;
    try {
      job = await requestJson(`/api/project/start-clipping/task?id=${encodeURIComponent(lookupId)}`);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 10) throw error;
      if (clipStatusDetail) clipStatusDetail.textContent = "连接短暂中断，正在恢复任务状态";
      await delay(Math.min(3000, 800 + consecutiveFailures * 300));
      continue;
    }
    latestClippingJob = job;
    lastClippingJobId = job.id || lastClippingJobId;
    const terminal = ["done", "cancelled", "error"].includes(job.status);
    if (terminal) {
      isClippingJobActive = false;
      activeClippingJobId = "";
    }
    renderClippingJobProgress(job);
    syncClippingTaskActions(job);
    if (job.status === "done") return job;
    if (job.status === "cancelled") throw new Error("切片任务已取消。");
    if (job.status === "error") throw new Error(job.message || job.error || "切片失败");
    if (round > 0 && round % 120 === 0 && clipStatusDetail) {
      clipStatusDetail.textContent = "仍在切片，素材较多时会更久";
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  const job = await requestJson("/api/project/start-clipping/task?id=latest");
  latestClippingJob = job;
  renderClippingJobProgress(job);
  if (isRunningClippingJob(job)) return job;
  throw new Error(job.message || job.error || "切片任务没有返回完成状态");
}

function isRunningClippingJob(job = latestClippingJob) {
  const status = job?.status || "";
  if (status) return Boolean(job?.id) && (status === "pending" || status === "running");
  return Boolean(isClippingJobActive && (activeClippingJobId || lastClippingJobId));
}

function renderClippingJobProgress(job = latestClippingJob) {
  if (!job?.id) return false;
  const status = job.status || "";
  const rawProgress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  if (displayedClippingJobId !== job.id) {
    displayedClippingJobId = job.id;
    displayedClippingProgress = rawProgress;
  }
  displayedClippingProgress = rawProgress;
  const progress = rawProgress;
  if (clipProgressLabel) clipProgressLabel.textContent = job.label || "切片进度";
  if (clipProgressText) clipProgressText.textContent = `${progress}%`;
  if (clipProgressBar) clipProgressBar.style.width = `${progress}%`;
  if (clipStatusDetail) {
    if (status === "done") {
      clipStatusDetail.textContent = "切片完成";
    } else if (status === "error") {
      clipStatusDetail.textContent = job.message || job.error || "切片失败";
    } else if (status === "cancelled") {
      clipStatusDetail.textContent = "切片任务已取消";
    } else {
      const elapsedSeconds = Math.max(0, Date.now() / 1000 - Number(job.created_at || Date.now() / 1000));
      const slowHint = elapsedSeconds > 45 && /AI|复核|初筛/.test(job.label || job.message || "") ? "，AI 处理可能稍慢" : "";
      clipStatusDetail.textContent = `${job.message || "正在切片"}${slowHint}`;
    }
  }
  return true;
}

function syncClippingTaskActions(job = {}) {
  const status = job.status || "";
  const hasJob = Boolean(job.id || activeClippingJobId || lastClippingJobId);
  const running = status ? (status === "pending" || status === "running") : isClippingJobActive;
  setButtonDisabledReason(cancelClippingButton, !hasJob || !running, running ? "" : "没有正在运行的切片任务");
}

function syncSingleClipActionAvailability(state = realState || {}) {
  const hasCurrentClips = currentClips(state).some((clip) => clip.status !== "deleted" && !clip.deleted_at);
  document.querySelectorAll("[data-clip-action]").forEach((button) => {
    setButtonDisabledReason(button, !hasCurrentClips, hasCurrentClips ? "" : "当前集还没有切片");
  });
}

async function startClipping(actionOverride = "") {
  if (!realState) {
    if (clipStatusDetail) clipStatusDetail.textContent = "请先新建或打开项目，再开始切片。";
    return;
  }
  const oldText = buttonLabel(startClipButton, "开始 AI 切片");
  if (startClipButton) {
    startClipButton.disabled = true;
    setButtonLabel(startClipButton, "切片中");
  }
  if (clipProgressLabel) clipProgressLabel.textContent = "切片进度";
  if (clipProgressText) clipProgressText.textContent = "0%";
  if (clipProgressBar) clipProgressBar.style.width = "0%";
  try {
    const selectedScope = selectedClippingScope();
    const selectedEpisodes = selectedScope.selectedEpisodes || [];
    if (!selectedEpisodes.length) {
      if (clipStatusDetail) clipStatusDetail.textContent = "请先选择至少一集。";
      return;
    }
    if ((actionOverride === "append" || actionOverride === "replace") && selectedEpisodes.length !== 1) {
      if (clipStatusDetail) clipStatusDetail.textContent = "重切或新增切片前，请只选择一集。";
      return;
    }
    const episodeStart = selectedScope.episodeStart;
    const episodeEnd = selectedScope.episodeEnd;
    const perEpisode = actionOverride === "append" ? 1 : readPositiveInt(clipTargetInput, 3);
    let gate = await refreshSubtitleGate();
    if (!gate?.can_start) {
      gate = await ensureSubtitlesBeforeClipping(gate, selectedEpisodes);
      if (!gate?.can_start) {
        setButtonLabel(startClipButton, oldText);
        const canPrepareSubtitles = Boolean(gate?.cloud_asr?.ready || gate?.local_asr?.ready);
        if (clipStatusDetail) clipStatusDetail.textContent = canPrepareSubtitles ? "" : "字幕识别未配置，请先在设置中接入字幕识别。";
        return;
      }
    }
    if (clipStatusDetail) clipStatusDetail.textContent = "正在切片";
    const result = await requestJson("/api/project/start-clipping/start", {
      method: "POST",
      body: JSON.stringify({
        mode: activeClipMode,
        per_episode: perEpisode,
        episode_start: episodeStart,
        episode_end: episodeEnd,
        episodes: selectedEpisodes,
        append: actionOverride === "append",
      }),
    });
    activeClippingJobId = result.id || "";
    lastClippingJobId = activeClippingJobId || lastClippingJobId;
    isClippingJobActive = true;
    latestClippingJob = result;
    renderClippingJobProgress(result);
    syncClippingTaskActions(result);
    await pollClippingJob(result.id);
    await refreshState();
    openWorkbench("review");
  } catch (error) {
    if (clipStatusDetail) clipStatusDetail.textContent = error.message || "切片失败";
  } finally {
    if (startClipButton) {
      setButtonLabel(startClipButton, oldText);
      const hasSelection = Boolean(selectedClippingScope().selectedEpisodes.length);
      setButtonDisabledReason(startClipButton, !hasSelection, hasSelection ? "" : "请先选择剧集");
    }
    isClippingJobActive = false;
    activeClippingJobId = "";
    syncClippingTaskActions({ id: lastClippingJobId, status: "done" });
  }
}

async function cancelClippingJob(button) {
  const jobId = activeClippingJobId || lastClippingJobId;
  if (!jobId) {
    if (clipStatusDetail) clipStatusDetail.textContent = "当前没有正在运行的切片任务。";
    return;
  }
  const oldText = buttonLabel(button, "取消任务");
  if (button) {
    button.disabled = true;
    setButtonLabel(button, "取消中");
  }
  try {
    const job = await requestJson("/api/project/start-clipping/cancel", {
      method: "POST",
      body: JSON.stringify({ id: jobId }),
    });
    if (clipStatusDetail) clipStatusDetail.textContent = job.message || "已请求取消，等待安全停止。";
    syncClippingTaskActions(job);
  } catch (error) {
    if (clipStatusDetail) clipStatusDetail.textContent = `取消失败：${error.message || error}`;
  } finally {
    if (button) setButtonLabel(button, oldText);
  }
}

async function exportPreviewFor(scope) {
  const params = new URLSearchParams();
  if (scope === "episode") params.set("episode", selectedEpisode);
  if (scope === "clip") {
    const clip = selectedClip(realState || {});
    if (clip?.episode) params.set("episode", clip.episode);
    if (clip?.id) params.set("clip_id", clip.id);
  }
  if (scope === "unexported" || scope === "episode") params.set("unexported_only", "true");
  return requestJson(`/api/export/preview${params.toString() ? `?${params.toString()}` : ""}`);
}

async function runExport(scope, button) {
  if (!realState) {
    if (exportDeliveryNote) exportDeliveryNote.textContent = "请先打开项目，再导出成片。";
    return;
  }
  const oldText = buttonLabel(button, "导出");
  setExportActionsBusy(true);
  if (button) setButtonLabel(button, "导出中");
  setExportProgress("导出任务", 8, "正在检查可导出片段。");
  try {
    const currentClip = scope === "clip" ? selectedClip(realState || {}) : null;
    if (scope === "clip" && (!currentClip || currentClip.status !== "confirmed")) {
      setExportProgress("导出任务", 0, "当前切片未确认。");
      return;
    }
    const preview = await exportPreviewFor(scope);
    if (!preview.exportable_count) {
      setExportProgress("导出任务", 0, "当前范围没有可导出片段，请先确认可用。");
      return;
    }
    setExportProgress("导出任务", 35, `准备导出 ${preview.exportable_count} 条片段。`);
    const result = await requestJson("/api/export", {
      method: "POST",
      body: JSON.stringify({
        episode: scope === "episode" ? selectedEpisode : null,
        clip_id: scope === "clip" ? (currentClip?.id || "") : "",
        only_ready: false,
        unexported_only: scope === "unexported" || scope === "episode",
      }),
    });
    setExportProgress("导出完成", 100, `成功 ${result.count || result.success_count || 0} 条，失败 ${result.failed_count || 0} 条。`);
    await refreshState();
    if (button) setButtonLabel(button, "已导出");
  } catch (error) {
    setExportProgress("导出失败", 100, `导出失败：${error.message || error}`);
    if (button) setButtonLabel(button, "导出失败");
  } finally {
    window.setTimeout(() => {
      if (button) setButtonLabel(button, oldText);
      setExportActionsBusy(false);
      if (realState) renderExportState(realState);
    }, 1200);
  }
}

async function updateOutputDir() {
  if (!realState) {
    if (exportToolStatus) exportToolStatus.textContent = "请先打开项目，再设置导出目录。";
    return false;
  }
  const current = realState.output_dir || "";
  const next = (exportOutputDirInput?.value || "").trim();
  if (!next) {
    if (exportToolStatus) exportToolStatus.textContent = "请先填写导出目录。";
    return false;
  }
  if (next === current) {
    if (exportToolStatus) exportToolStatus.textContent = "导出目录没有变化。";
    return true;
  }
  setExportProgress("导出目录", 10, "正在保存导出目录。");
  try {
    const result = await requestJson("/api/project/output-dir", {
      method: "POST",
      body: JSON.stringify({ output_dir: next }),
    });
    realState = result.state;
    renderHomeState(realState);
    if (exportToolStatus) exportToolStatus.textContent = result.warning || "导出目录已更新。";
    setExportProgress("导出目录", 100, result.warning || "导出目录已更新。");
    return true;
  } catch (error) {
    if (exportToolStatus) exportToolStatus.textContent = `目录保存失败：${error.message || error}`;
    setExportProgress("导出目录", 100, `目录保存失败：${error.message || error}`);
    return false;
  }
}

async function openOutputDir(button) {
  if (button) {
    button.disabled = true;
  }
  if (exportToolStatus) exportToolStatus.textContent = "正在打开导出目录…";
  try {
    const result = await requestJson("/api/project/open-output-dir", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (exportToolStatus) exportToolStatus.textContent = `已打开：${result.output_dir || ""}`;
  } catch (error) {
    if (exportToolStatus) exportToolStatus.textContent = `打开失败：${error.message || error}`;
  } finally {
    window.setTimeout(() => {
      if (button) {
        button.disabled = false;
      }
    }, 1000);
  }
}

async function chooseOutputDir(button) {
  if (button) button.disabled = true;
  if (exportToolStatus) exportToolStatus.textContent = "";
  try {
    if (!window.shortDramaDesktop?.chooseOutputDir) {
      if (exportToolStatus) exportToolStatus.textContent = "请在桌面版中选择导出文件夹。";
      return;
    }
    const picked = await window.shortDramaDesktop.chooseOutputDir(exportOutputDirInput?.value || realState?.output_dir || "");
    if (picked?.cancelled) {
      if (exportToolStatus) exportToolStatus.textContent = "";
      return;
    }
    if (!picked?.path) {
      throw new Error("未选择导出文件夹");
    }
    const result = await requestJson("/api/project/output-dir", {
      method: "POST",
      body: JSON.stringify({ output_dir: picked.path }),
    });
    if (result.cancelled) {
      if (exportToolStatus) exportToolStatus.textContent = "";
      return;
    }
    realState = result.state || realState;
    if (exportOutputDirInput) exportOutputDirInput.value = result.output_dir || realState?.output_dir || "";
    renderHomeState(realState);
    renderExportState(realState);
    if (exportToolStatus) exportToolStatus.textContent = result.warning || "";
  } catch (error) {
    if (exportToolStatus) exportToolStatus.textContent = `选择失败：${error.message || error}`;
  } finally {
    if (button) button.disabled = false;
  }
}

async function retryFailedExports(button) {
  const failedClips = (realState?.clips || []).filter((clip) => clip.export_error || clip.export_failed_at || clip.export_status === "failed");
  if (!failedClips.length) {
    setExportProgress("重试失败", 0, "当前没有失败片段。");
    return;
  }
  const episode = failedClips[0].episode || selectedEpisode;
  selectedEpisode = String(episode);
  renderSourceState(realState);
  renderExportState(realState);
  setExportProgress("重试失败", 10, `正在重试第 ${episode} 集失败片段。`);
  await runExport("episode", button);
}

function parseEpisodeScope(state, rows) {
  const scope = String(state.episode_scope || "").trim();
  const available = rows.map((row) => Number(row.episode)).filter(Boolean);
  if (scope.includes("-")) {
    const [start, end] = scope.split("-").map((part) => Number(part.trim())).filter(Boolean);
    if (start && end) return { start, end };
  }
  const scopedNumber = Number(scope);
  if (scopedNumber) return { start: scopedNumber, end: scopedNumber };
  if (available.length) return { start: Math.min(...available), end: Math.max(...available) };
  return { start: 1, end: 1 };
}

function clippingTask(state) {
  return (state.tasks || []).find((task) => task.key === "start_clipping") || {};
}

function selectedClippingScope() {
  const selected = [...selectedClipEpisodes].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (selected.length) {
    return { episodeStart: selected[0], episodeEnd: selected[selected.length - 1], selectedEpisodes: selected };
  }
  return { episodeStart: 0, episodeEnd: 0, selectedEpisodes: [] };
}

function selectedEpisodesParam() {
  return selectedClippingScope().selectedEpisodes.join(",");
}

function selectedEpisodesLabel(selected) {
  if (!selected.length) return "未选择剧集";
  if (selected.length === 1) return `第 ${selected[0]} 集`;
  return `已选 ${selected.length} 集`;
}

function durationBasedClipEstimate(row, fallbackTarget = 3) {
  const duration = Number(row?.asset?.duration || row?.asset?.source_duration || row?.asset?.episode_duration || row?.clips?.[0]?.source_duration || row?.clips?.[0]?.episode_duration || 0);
  const episode = Number(row?.episode || 0);
  const target = Math.max(1, Number(fallbackTarget || 3));
  if (!duration) return episode === 1 ? Math.max(target, 4) : target;
  const averageSceneSeconds = episode === 1 ? 38 : 45;
  const capacity = Math.max(1, Math.round(duration / averageSceneSeconds));
  const firstEpisodeBonus = episode === 1 ? 1 : 0;
  return Math.max(1, Math.min(target + firstEpisodeBonus, capacity + firstEpisodeBonus));
}

function localClippingEstimate(state = realState || {}) {
  const selected = selectedClippingScope().selectedEpisodes || [];
  const rows = episodeRows(state).filter((row) => selected.includes(Number(row.episode)));
  const requestedPerEpisode = readPositiveInt(clipTargetInput, 3);
  const estimated = rows.reduce((sum, row) => sum + durationBasedClipEstimate(row, requestedPerEpisode), 0);
  const requested = rows.length * requestedPerEpisode;
  return { selectedCount: rows.length, estimated, requested };
}

function clippingPrimaryActionLabel(state, task, selectedEpisodes) {
  if (isRunningClippingJob(task)) return "切片中";
  const selected = (selectedEpisodes || []).map(Number).filter(Number.isFinite);
  if (!selected.length) return "智能切片";
  if (selected.length === 1) {
    const row = episodeRows(state || {}).find((item) => Number(item.episode) === selected[0]);
    return row?.clips?.length ? "重新生成本集" : "生成本集切片";
  }
  return "智能切片";
}

function formatClipEstimateSummary(selectedCount, estimated) {
  const count = Math.max(0, Number(selectedCount || 0));
  const estimate = Math.max(0, Number(estimated || 0));
  return `已选 ${count} 集，预计 ${estimate} 条切片`;
}

function renderClipEpisodeGrid(state) {
  if (!clipEpisodeGrid) return;
  const rows = episodeRows(state);
  if (!rows.length) {
    clipEpisodeGrid.innerHTML = "";
    selectedClipEpisodes.clear();
    return;
  }
  if (!selectedClipEpisodes.size && !clipEpisodeGrid.dataset.touched) {
    rows.forEach((row) => selectedClipEpisodes.add(Number(row.episode)));
  }
  const available = new Set(rows.map((row) => Number(row.episode)));
  selectedClipEpisodes = new Set([...selectedClipEpisodes].filter((episode) => available.has(Number(episode))));
  clipEpisodeGrid.innerHTML = rows.map((row) => {
    const episode = Number(row.episode);
    const active = selectedClipEpisodes.has(episode);
    return `<button class="episode-chip ${active ? "active" : ""}" type="button" data-clip-episode="${episode}" aria-pressed="${active ? "true" : "false"}" title="${escapeHtml(formatEpisodeLong(episode, state))}">${escapeHtml(formatEpisodeCompact(episode, state))}</button>`;
  }).join("");
  const selectAllButton = document.querySelector("[data-select-all-episodes]");
  const selected = [...selectedClipEpisodes].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (selectAllButton) {
    const allSelected = rows.length && rows.every((row) => selectedClipEpisodes.has(Number(row.episode)));
    selectAllButton.textContent = allSelected ? "取消全选" : "全选";
    selectAllButton.setAttribute("aria-pressed", allSelected ? "true" : "false");
  }
  if (clipEpisodePickMeta) {
    clipEpisodePickMeta.textContent = selected.length ? selectedEpisodesLabel(selected) : "点击数字选择";
  }
}

function setSubtitleStatusBadge(element, label, tone = "missing") {
  if (!element) return;
  element.textContent = label;
  element.classList.toggle("ready", tone === "ready");
  element.classList.toggle("missing", tone === "missing");
  element.classList.toggle("working", tone === "working");
}

function currentSubtitleMode() {
  return document.querySelector("[data-subtitle-mode].active")?.dataset.subtitleMode === "srt" ? "srt" : "api";
}

function renderSubtitleProviderStatus(gate = latestSubtitleGate) {
  const cloud = gate?.cloud_asr || {};
  const provider = cloud.display_name || cloud.provider || "云端 ASR";
  const ready = Boolean(cloud.ready);
  if (subtitleApiProviderLabel) subtitleApiProviderLabel.textContent = provider;
  setSubtitleStatusBadge(subtitleApiReadyLabel, ready ? "已接入" : "未接入", ready ? "ready" : "missing");
  setSubtitleStatusBadge(subtitleAsrStatus, ready ? "API 已接入" : "API 未接入", ready ? "ready" : "missing");
  if (subtitleApiHint) {
    subtitleApiHint.textContent = "";
    subtitleApiHint.hidden = true;
    subtitleApiHint.classList.remove("good", "warning");
  }
  if (subtitleSrtStatus && realState) {
    const selectedEpisodeNumber = Number(selectedEpisode);
    const subtitleMode = currentSubtitleMode();
    const readyItem = (gate?.ready_items || gate?.ready || []).find?.((item) => Number(item.episode) === selectedEpisodeNumber);
    if (subtitleMode === "srt" && readyItem?.manual_imported) {
      subtitleSrtStatus.textContent = "本集字幕已导入。";
      subtitleSrtStatus.hidden = false;
      subtitleSrtStatus.classList.add("good");
      subtitleSrtStatus.classList.remove("warning");
    } else {
      subtitleSrtStatus.textContent = "";
      subtitleSrtStatus.hidden = true;
      subtitleSrtStatus.classList.remove("good");
      subtitleSrtStatus.classList.remove("warning");
    }
  }
}

async function refreshTranscriptQueueState() {
  try {
    const payload = await requestJson("/api/transcript/queue-status");
    latestTranscriptQueue = payload?.queue || null;
    if (realState && latestTranscriptQueue) {
      realState.transcript_queue = latestTranscriptQueue;
    }
    renderTranscriptQueueState(realState);
    return latestTranscriptQueue;
  } catch (_) {
    renderTranscriptQueueState(realState);
    return latestTranscriptQueue;
  }
}

function renderSubtitleGate(gate) {
  const hasSelection = Boolean(selectedClippingScope().selectedEpisodes.length);
  renderSubtitleProviderStatus(gate);
  if (subtitleRequiredWarning) {
    subtitleRequiredWarning.hidden = true;
    subtitleRequiredWarning.firstChild.textContent = "";
  }
  if (startClipButton) {
    setButtonDisabledReason(startClipButton, !hasSelection, hasSelection ? "" : "请先选择剧集");
  }
  renderTranscriptQueueState(realState);
  refreshTranscriptQueueState();
}

function renderTranscriptQueueState(state = realState) {
  if (isRunningClippingJob() || isSubtitlePreparationActive) return;
  const queue = latestTranscriptQueue || state?.transcript_queue || {};
  if (!queue.status || queue.status === "idle") return;
  const items = queue.items || [];
  const failed = items.find((item) => item.status === "failed");
  const running = items.find((item) => item.status === "running");
  if (queue.status === "failed" || failed) {
    setSubtitleStatusBadge(subtitleAsrStatus, "生成失败", "missing");
    setSubtitleStatusBadge(subtitleApiReadyLabel, "失败", "missing");
    if (clipProgressLabel) clipProgressLabel.textContent = "字幕识别";
    if (clipProgressText) clipProgressText.textContent = "失败";
    if (clipProgressBar) clipProgressBar.style.width = "100%";
    if (clipStatusDetail) clipStatusDetail.textContent = `${failed?.episode ? `EP${failed.episode} ` : ""}字幕生成失败`;
    return;
  }
  if (queue.status === "running" || running) {
    setSubtitleStatusBadge(subtitleAsrStatus, "字幕生成中", "working");
    setSubtitleStatusBadge(subtitleApiReadyLabel, "生成中", "working");
    if (clipProgressLabel) clipProgressLabel.textContent = "字幕识别";
    if (clipProgressText) clipProgressText.textContent = "";
    if (clipStatusDetail) clipStatusDetail.textContent = queue.message || running?.message || "字幕生成中";
  }
}

async function refreshSubtitleGate() {
  const { episodeStart, episodeEnd } = selectedClippingScope();
  const episodes = selectedEpisodesParam();
  if (!episodeStart || !episodeEnd) {
    latestSubtitleGate = {
      ...(latestSubtitleGate || {}),
      can_start: false,
      no_selection: true,
      message: "请先选择至少一集。",
      missing_count: 0,
    };
    renderSubtitleGate(latestSubtitleGate);
    return latestSubtitleGate;
  }
  try {
    latestSubtitleGate = await requestJson(`/api/project/start-clipping/subtitle-gate?episode_start=${encodeURIComponent(episodeStart)}&episode_end=${encodeURIComponent(episodeEnd)}&episodes=${encodeURIComponent(episodes)}`);
  } catch (error) {
    latestSubtitleGate = { can_start: false, message: error.message || "字幕状态读取失败" };
  }
  renderSubtitleGate(latestSubtitleGate);
  return latestSubtitleGate;
}

async function refreshClippingEstimate() {
  if (!clipSummary) return null;
  const { episodeStart, episodeEnd } = selectedClippingScope();
  const episodes = selectedEpisodesParam();
  const perEpisode = readPositiveInt(clipTargetInput, 3);
  if (!episodeStart || !episodeEnd) {
    clipSummary.textContent = formatClipEstimateSummary(0, 0);
    if (clipStatusDetail) clipStatusDetail.textContent = "";
    return null;
  }
  try {
    const estimate = await requestJson(`/api/project/start-clipping/estimate?episode_start=${encodeURIComponent(episodeStart)}&episode_end=${encodeURIComponent(episodeEnd)}&episodes=${encodeURIComponent(episodes)}&per_episode=${encodeURIComponent(perEpisode)}`);
    const total = estimate.totals || {};
    clipSummary.textContent = formatClipEstimateSummary(total.episodes, total.estimated);
    if (clipStatusDetail && !isRunningClippingJob()) {
      clipStatusDetail.textContent = "";
    }
    return estimate;
  } catch (error) {
    const fallback = localClippingEstimate();
    clipSummary.textContent = formatClipEstimateSummary(fallback.selectedCount, fallback.estimated);
    if (clipStatusDetail && !isRunningClippingJob() && !isSubtitlePreparationActive) {
      clipStatusDetail.textContent = "";
    }
    return null;
  }
}

function scheduleClippingEstimate() {
  window.clearTimeout(clippingEstimateTimer);
  clippingEstimateTimer = window.setTimeout(() => {
    refreshSubtitleGate();
    refreshClippingEstimate();
  }, 250);
}

function renderClipSetupState(state) {
  const rows = episodeRows(state);
  const clips = state.clips || [];
  const plan = state.clip_count_plan || {};
  const episodeCounts = plan.episode_counts || plan.overrides || {};
  const scope = parseEpisodeScope(state, rows);
  const defaultTarget = Number(plan.default_per_episode || plan.default_clip_count || 3);
  const selectedTarget = Number(episodeCounts[String(selectedEpisode)] || defaultTarget);
  const totalTarget = rows.reduce((sum, row) => sum + Number(episodeCounts[String(row.episode)] || defaultTarget), 0);
  const task = isRunningClippingJob() ? latestClippingJob : clippingTask(state);
  const progress = Math.max(0, Math.min(100, Number(task?.progress || (clips.length ? 100 : 0))));
  renderClipEpisodeGrid(state);
  syncSingleClipActionAvailability(state);
  const scopeSelection = selectedClippingScope();
  if (clipStartEpisodeInput) clipStartEpisodeInput.value = String(scopeSelection.episodeStart);
  if (clipEndEpisodeInput) clipEndEpisodeInput.value = String(scopeSelection.episodeEnd);
  if (clipTargetInput) clipTargetInput.value = String(defaultTarget);
  if (singleEpisodeInput) singleEpisodeInput.value = String(scopeSelection.episodeStart);
  if (singleTargetInput) singleTargetInput.value = String(selectedTarget);
  if (minimumDurationInput) minimumDurationInput.value = "40 秒";
  if (clipSummary) {
    const fallback = localClippingEstimate(state);
    clipSummary.textContent = formatClipEstimateSummary(fallback.selectedCount, fallback.estimated);
  }
  if (clipStatusDetail) {
    clipStatusDetail.textContent = isRunningClippingJob(task) ? (task.message || "正在切片") : "";
  }
  if (clipProgressLabel) {
    clipProgressLabel.textContent = task.label || "切片进度";
  }
  if (clipProgressText) {
    clipProgressText.textContent = `${progress}%`;
  }
  if (clipProgressBar) {
    clipProgressBar.style.width = `${progress}%`;
  }
  if (startClipButton) {
    setButtonLabel(startClipButton, clippingPrimaryActionLabel(state, task, scopeSelection.selectedEpisodes));
    const hasSelection = Boolean(scopeSelection.selectedEpisodes?.length);
    setButtonDisabledReason(startClipButton, isRunningClippingJob(task) || !hasSelection, !hasSelection ? "请先选择剧集" : "");
  }
  syncClippingTaskActions({ id: lastClippingJobId, status: task.status || "" });
  refreshSubtitleGate();
  refreshClippingEstimate();
  if (isRunningClippingJob()) renderClippingJobProgress();
  renderTranscriptQueueState(state);
}

function readPositiveInt(input, fallback = 1) {
  const value = Number(input?.value || fallback);
  const minimum = Number(input?.min || 1);
  const maximum = Number(input?.max || 9999);
  return Math.max(minimum, Math.min(maximum, Math.round(Number.isFinite(value) ? value : fallback)));
}

function syncClipConfigSummary() {
  if (!clipSummary) return;
  const fallback = localClippingEstimate();
  clipSummary.textContent = formatClipEstimateSummary(fallback.selectedCount, fallback.estimated);
  if (clipStatusDetail && !isRunningClippingJob()) {
    clipStatusDetail.textContent = "";
  }
}

function renderHomeState(state) {
  const assets = state.assets || [];
  const clips = state.clips || [];
  const confirmed = approvedClipCount(clips);
  const projectName = state.project_name || "未加载项目";
  const exported = clips.filter((clip) => clip.exported_at).length;
  homeProjectTitle.textContent = projectName;
  homeProjectDesc.textContent = "";
  homeStatMedia.textContent = String(assets.length);
  homeStatClips.textContent = String(activeClipCount(clips));
  homeStatReview.textContent = String(confirmed);
  if (projectChipTitle) projectChipTitle.textContent = projectName;
  if (projectChipMeta) projectChipMeta.textContent = "";
  renderSourceState(state);
  renderClipSetupState(state);
  renderReviewState(state);
  renderExportState(state);
}

async function loadHomeState() {
  try {
    const state = await requestJson("/api/state");
    realState = state;
    renderHomeState(state);
    loadProjectList();
    try {
      const job = await requestJson("/api/project/start-clipping/task?id=latest");
      if (job?.id) {
        latestClippingJob = job;
        lastClippingJobId = job.id;
        const running = job.status === "pending" || job.status === "running";
        isClippingJobActive = running;
        activeClippingJobId = running ? job.id : "";
        renderClippingJobProgress(job);
        syncClippingTaskActions(job);
        if (job.status === "done") {
          await refreshState();
        } else if (running) {
          pollClippingJob(job.id)
            .then(() => refreshState())
            .catch((error) => {
              isClippingJobActive = false;
              activeClippingJobId = "";
              if (clipStatusDetail) clipStatusDetail.textContent = error.message || "切片任务状态恢复失败";
              syncClippingTaskActions(latestClippingJob || {});
            });
        }
      }
    } catch (_) {
      isClippingJobActive = false;
      activeClippingJobId = "";
    }
  } catch (error) {
    homeProjectTitle.textContent = "项目状态读取失败";
    homeProjectDesc.textContent = "请确认本地服务正在运行，然后刷新页面。";
    loadProjectList();
  }
}

function setClipMode(mode) {
  activeClipMode = mode === "single" ? "single" : "batch";
  document.querySelectorAll("[data-clip-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.clipMode === activeClipMode);
  });
  if (realState) {
    const rows = episodeRows(realState);
    selectedClipEpisodes.clear();
    if (activeClipMode === "single") {
      selectedClipEpisodes.add(Number(selectedEpisode || rows[0]?.episode || 1));
    } else {
      rows.forEach((row) => selectedClipEpisodes.add(Number(row.episode)));
    }
  }
  if (singleClipActionPanel) singleClipActionPanel.classList.remove("hidden");
  if (realState) {
    renderClipSetupState(realState);
  } else {
    syncClipConfigSummary();
  }
  refreshSubtitleGate();
  refreshClippingEstimate();
  if (clipStatusDetail) {
    clipStatusDetail.textContent = activeClipMode === "single"
      ? "已切换到单集切片，只处理当前选择的剧集。"
      : "已切换到全部切片，将按起止集范围生成候选。";
  }
}

function setSubtitleMode(mode) {
  const activeSubtitleMode = mode === "srt" ? "srt" : "api";
  document.querySelectorAll("[data-subtitle-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.subtitleMode === activeSubtitleMode);
  });
  document.querySelectorAll("[data-subtitle-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.subtitlePanel !== activeSubtitleMode);
  });
  renderSubtitleProviderStatus(latestSubtitleGate);
}

function selectEpisode(episode) {
  if (realState) {
    selectedEpisode = String(episode);
    selectedClipId = "";
    previewMode = "episode";
    draftTrim = null;
    renderSourceState(realState);
    renderClipSetupState(realState);
    loadEpisodePreview(realState);
    renderExportState(realState);
    return;
  }
  document.querySelectorAll("[data-episode-toggle]").forEach((row) => {
    const active = row.dataset.episodeToggle === episode;
    row.classList.toggle("active", active);
    const label = row.querySelector("em");
    const meta = episodeClipMeta[row.dataset.episodeToggle];
    if (label && meta) {
      label.textContent = active ? "已选择" : meta.status;
    }
  });
  document.querySelectorAll("[data-episode-clips]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.episodeClips === episode);
  });
  const meta = episodeClipMeta[episode];
  if (meta) {
    episodeCountLabel.textContent = meta.episodeLabel;
    clipCountLabel.textContent = meta.clipLabel;
  }
}

function loadEpisodePreview(state = realState || {}) {
  const episodeClip = episodePreviewClip(state);
  if (!episodeClip) {
    loadPreviewClip(null, "episode");
    if (monitorTitle) monitorTitle.textContent = `${formatEpisodeLong(selectedEpisode)} · 无可播放素材`;
    if (reviewRiskText) reviewRiskText.textContent = "当前剧集没有可播放原片。";
    return;
  }
  loadPreviewClip(episodeClip, "episode");
  if (monitorMode) monitorMode.textContent = "原片监视器";
  if (monitorTitle) monitorTitle.textContent = `${formatEpisode(selectedEpisode)} · ${episodeClip.filename || "原剧集"}`;
  if (reviewRiskText) reviewRiskText.textContent = "正在预览整集原片；点击下方切片可切回候选片段。";
}

function selectClip(clipId) {
  if (!realState) return;
  selectedClipId = clipId;
  previewMode = "clip";
  draftTrim = null;
  renderSourceState(realState);
  renderReviewState(realState);
  const clip = selectedClip(realState);
  if (monitorMode) monitorMode.textContent = "候选片段监视器";
  if (monitorTitle && clip) monitorTitle.textContent = `${formatEpisode(clip.episode)} · ${clip.id || "候选片段"}`;
  if (reviewRiskText && clip) reviewRiskText.textContent = `已切换到 ${clip.id || "当前候选"}，可播放、微调或确认。`;
}

function togglePlayback() {
  if (!previewVideo || !activePreviewClip) {
    setVideoPlaceholder("请先选择剧集或切片", true);
    return;
  }
  if (previewVideo.readyState === 0) {
    setVideoPlaceholder("视频仍在加载", true);
    previewVideo.load();
    return;
  }
  if (previewVideo.paused) {
    const start = clipStart();
    const end = clipEnd();
    if (previewVideo.currentTime < start) previewVideo.currentTime = start;
    if (previewMode === "clip" && end && previewVideo.currentTime >= end) previewVideo.currentTime = Math.max(0, start);
    if (previewMode === "episode" && previewVideo.duration && previewVideo.currentTime >= previewVideo.duration) previewVideo.currentTime = 0;
    previewVideo.play().catch((error) => {
      window.__lastPreviewPlayError = {
        name: error?.name || "",
        message: error?.message || "",
        code: error?.code || "",
      };
      pausePreview();
      setVideoPlaceholder(error?.name === "NotAllowedError" ? "点击播放后再试一次" : "播放失败，请重选素材", true);
    });
  } else {
    pausePreview();
  }
}

document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-dialog-cancel]")) {
    closeAppDialog(null);
    return;
  }

  if (event.target.closest("[data-dialog-confirm]")) {
    closeAppDialog(appDialogInput && !appDialogInput.hidden ? appDialogInput.value : true);
    return;
  }

  if (event.target === appDialog) {
    closeAppDialog(null);
    return;
  }

  if (event.target.closest(".play-button")) {
    togglePlayback();
    return;
  }

  const projectButton = event.target.closest("[data-project-title]");
  if (projectButton) {
    document.querySelectorAll("[data-project-title]").forEach((button) => button.classList.toggle("active", button === projectButton));
    homeProjectTitle.textContent = projectButton.dataset.projectTitle;
    homeProjectDesc.textContent = "";
    homeStatMedia.textContent = projectButton.dataset.media;
    homeStatClips.textContent = projectButton.dataset.clips;
    homeStatReview.textContent = projectButton.dataset.review;
    return;
  }

  const projectLoadButton = event.target.closest("[data-project-load]");
  if (projectLoadButton) {
    loadProject(projectLoadButton.dataset.baseDir, projectLoadButton.dataset.statePath);
    return;
  }

  const projectDeleteButton = event.target.closest("[data-project-delete]");
  if (projectDeleteButton && !projectDeleteButton.disabled) {
    deleteProject(projectDeleteButton.dataset.baseDir, projectDeleteButton.dataset.statePath);
    return;
  }

  const projectRestoreButton = event.target.closest("[data-project-restore]");
  if (projectRestoreButton && !projectRestoreButton.disabled) {
    restoreProject(projectRestoreButton.dataset.trashPath);
    return;
  }

  const projectPurgeButton = event.target.closest("[data-project-purge]");
  if (projectPurgeButton && !projectPurgeButton.disabled) {
    purgeDeletedProject(projectPurgeButton.dataset.trashPath, projectPurgeButton.dataset.projectName);
    return;
  }

  if (event.target.closest("[data-project-new]")) {
    createProject();
    return;
  }

  if (event.target.closest("[data-project-rename]")) {
    renameProject();
    return;
  }

  const openButton = event.target.closest("[data-open-workbench]");
  if (openButton) {
    openWorkbench("media");
    return;
  }

  const backButton = event.target.closest("[data-back-home]");
  if (backButton) {
    body.dataset.page = "home";
    return;
  }

  if (event.target.closest("[data-open-settings]")) {
    openSettingsPage();
    return;
  }

  if (event.target.closest("[data-open-asr-settings]")) {
    openSettingsPage();
    setSettingsTab("asr");
    return;
  }

  if (event.target.closest("[data-settings-back]")) {
    closeSettingsPage();
    return;
  }

  const settingsTabButton = event.target.closest("[data-settings-tab]");
  if (settingsTabButton) {
    setSettingsTab(settingsTabButton.dataset.settingsTab);
    return;
  }

  const pageButton = event.target.closest("[data-page-target]");
  if (pageButton) {
    openWorkbench(pageButton.dataset.pageTarget);
    return;
  }

  const settingsSaveButton = event.target.closest("[data-settings-save]");
  if (settingsSaveButton) {
    saveSettingsPage(settingsSaveButton);
    return;
  }

  const settingsTestAsrButton = event.target.closest("[data-settings-test-asr]");
  if (settingsTestAsrButton) {
    testAsrSettings(settingsTestAsrButton);
    return;
  }

  const modeButton = event.target.closest("[data-clip-mode]");
  if (modeButton) {
    setClipMode(modeButton.dataset.clipMode);
    return;
  }

  const clipActionButton = event.target.closest("[data-clip-action]");
  if (clipActionButton) {
    if (clipActionButton.disabled) {
      if (clipStatusDetail) clipStatusDetail.textContent = "当前集还没有切片，先点击智能切片。";
      return;
    }
    startClipping(clipActionButton.dataset.clipAction === "append" ? "append" : "replace");
    return;
  }

  const clipEpisodeButton = event.target.closest("[data-clip-episode]");
  if (clipEpisodeButton) {
    const episode = Number(clipEpisodeButton.dataset.clipEpisode);
    if (clipEpisodeGrid) clipEpisodeGrid.dataset.touched = "true";
    if (selectedClipEpisodes.has(episode)) {
      selectedClipEpisodes.delete(episode);
    } else {
      selectedClipEpisodes.add(episode);
    }
    activeClipMode = selectedClipEpisodes.size === 1 ? "single" : "batch";
    document.querySelectorAll("[data-clip-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.clipMode === activeClipMode);
    });
    renderClipEpisodeGrid(realState || {});
    syncClipConfigSummary();
    refreshSubtitleGate();
    refreshClippingEstimate();
    return;
  }

  const selectAllEpisodesButton = event.target.closest("[data-select-all-episodes]");
  if (selectAllEpisodesButton) {
    const rows = episodeRows(realState || {});
    if (clipEpisodeGrid) clipEpisodeGrid.dataset.touched = "true";
    const allSelected = rows.length && rows.every((row) => selectedClipEpisodes.has(Number(row.episode)));
    selectedClipEpisodes.clear();
    if (!allSelected) rows.forEach((row) => selectedClipEpisodes.add(Number(row.episode)));
    activeClipMode = selectedClipEpisodes.size === 1 ? "single" : "batch";
    document.querySelectorAll("[data-clip-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.clipMode === activeClipMode);
    });
    renderClipEpisodeGrid(realState || {});
    syncClipConfigSummary();
    refreshSubtitleGate();
    refreshClippingEstimate();
    return;
  }

  if (event.target.closest("[data-import-assets]")) {
    assetUploadInput?.click();
    return;
  }

  if (event.target.closest("[data-srt-import]")) {
    srtUploadInput?.click();
    return;
  }

  const clippingCancelButton = event.target.closest("[data-clipping-cancel]");
  if (clippingCancelButton) {
    cancelClippingJob(clippingCancelButton);
    return;
  }

  const subtitleButton = event.target.closest("[data-subtitle-mode]");
  if (subtitleButton) {
    setSubtitleMode(subtitleButton.dataset.subtitleMode);
    return;
  }

  const episodeButton = event.target.closest("[data-episode-toggle]");
  if (episodeButton) {
    selectEpisode(episodeButton.dataset.episodeToggle);
    return;
  }

  const assetDeleteButton = event.target.closest("[data-asset-delete]");
  if (assetDeleteButton) {
    deleteAsset(assetDeleteButton.dataset.assetDelete);
    return;
  }

  const assetRestoreButton = event.target.closest("[data-asset-restore]");
  if (assetRestoreButton) {
    restoreAsset(assetRestoreButton.dataset.assetRestore, assetRestoreButton.dataset.originalPath);
    return;
  }

  const clipDeleteButton = event.target.closest("[data-clip-delete]");
  if (clipDeleteButton) {
    deleteClip(clipDeleteButton.dataset.clipDelete);
    return;
  }

  const clipButton = event.target.closest("[data-clip-id]");
  if (clipButton && realState) {
    selectClip(clipButton.dataset.clipId);
    return;
  }

  const nudgeButton = event.target.closest("[data-trim-nudge]");
  if (nudgeButton) {
    const [which, rawDelta] = nudgeButton.dataset.trimNudge.split(":");
    nudgeTrim(which, Number(rawDelta || 0));
    return;
  }

  const jumpButton = event.target.closest("[data-preview-jump]");
  if (jumpButton && previewVideo) {
    const trim = activeTrim();
    const jumpToEnd = jumpButton.dataset.previewJump === "end";
    previewVideo.currentTime = jumpToEnd ? Math.max(trim.start, trim.end - 0.6) : trim.start;
    updatePreviewTransport();
    if (reviewRiskText) reviewRiskText.textContent = jumpToEnd ? "已跳到出点前，检查结尾是否断句或串戏。" : "已跳到入点，检查开头是否完整进入本场戏。";
    return;
  }

  if (event.target.closest("[data-trim-reset]")) {
    resetDraftTrim();
    return;
  }

  if (event.target.closest("[data-trim-discard]")) {
    discardDraftTrim();
    return;
  }

  if (event.target.closest("[data-trim-save]")) {
    saveDraftTrim();
    return;
  }

  const reviewActionButton = event.target.closest("[data-review-action]");
  if (reviewActionButton) {
    updateReviewDecision(reviewActionButton.dataset.reviewAction, reviewActionButton);
    return;
  }

  if (event.target.closest("[data-ai-reselect]")) {
    runAiReselect(aiReselectButton);
    return;
  }

  const exportButton = event.target.closest("[data-export-scope]");
  if (exportButton) {
    runExport(exportButton.dataset.exportScope, exportButton);
    return;
  }

  const outputChooseButton = event.target.closest("[data-output-dir-choose]");
  if (outputChooseButton) {
    chooseOutputDir(outputChooseButton);
    return;
  }

  const exportEpisodeButton = event.target.closest("[data-export-episode]");
  if (exportEpisodeButton) {
    selectedEpisode = String(exportEpisodeButton.dataset.exportEpisode);
    renderSourceState(realState);
    renderExportState(realState);
    if (exportDeliveryNote) exportDeliveryNote.textContent = `已切到${formatEpisodeLong(selectedEpisode)}，可导出本集已确认且未导出的片段。`;
    if (exportTaskText) exportTaskText.textContent = `已切到${formatEpisodeLong(selectedEpisode)}，可导出本集。`;
    return;
  }

});

function timelineTimeFromEvent(event) {
  if (!editTimeline) return null;
  const rect = editTimeline.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const trim = activeTrim();
  const rail = timelineRail(trim);
  return rail.start + ratio * rail.duration;
}

let activeDragHandle = "";

trimHandleStart?.addEventListener("pointerdown", (event) => {
  activeDragHandle = "start";
  trimHandleStart.setPointerCapture?.(event.pointerId);
});

trimHandleEnd?.addEventListener("pointerdown", (event) => {
  activeDragHandle = "end";
  trimHandleEnd.setPointerCapture?.(event.pointerId);
});

document.addEventListener("pointermove", (event) => {
  if (!activeDragHandle) return;
  const time = timelineTimeFromEvent(event);
  if (time === null) return;
  const trim = activeTrim();
  if (activeDragHandle === "start") setDraftTrim(time, trim.end, "start");
  if (activeDragHandle === "end") setDraftTrim(trim.start, time, "end");
});

document.addEventListener("pointerup", () => {
  activeDragHandle = "";
});

editTimeline?.addEventListener("click", (event) => {
  if (event.target.closest(".trim-handle")) return;
  const time = timelineTimeFromEvent(event);
  if (time === null || !previewVideo) return;
  const rail = timelineRail();
  previewVideo.currentTime = Math.max(rail.start, Math.min(rail.end, time));
  updatePreviewTransport();
});

document.addEventListener("keydown", (event) => {
  if (appDialog && !appDialog.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAppDialog(null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      closeAppDialog(appDialogInput && !appDialogInput.hidden ? appDialogInput.value : true);
      return;
    }
  }
  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (event.key === "1") openWorkbench("media");
  if (event.key === "2") openWorkbench("clip");
  if (event.key === "3") openWorkbench("review");
  if (event.key === "4") openWorkbench("export");
});

previewVideo?.addEventListener("play", () => {
  isPlaying = true;
  setVideoPlaceholder("", false);
  playButton?.classList.add("is-playing");
  playButton?.setAttribute("aria-label", "暂停");
});

previewVideo?.addEventListener("pause", () => {
  pausePreview();
});

previewVideo?.addEventListener("timeupdate", () => {
  if (!previewVideo || !activePreviewClip) return;
  const end = clipEnd();
  if (previewMode === "clip" && isPlaying && end && previewVideo.currentTime >= end) {
    pausePreview();
    previewVideo.currentTime = end;
  }
  updatePreviewTransport();
});

previewVideo?.addEventListener("loadedmetadata", () => {
  syncVideoOrientation();
  setVideoPlaceholder("", false);
  updateTrimUi();
  updatePreviewTransport();
});

previewVideo?.addEventListener("loadeddata", () => {
  setVideoPlaceholder("", false);
});

previewVideo?.addEventListener("error", () => {
  pausePreview();
  setVideoPlaceholder("视频无法播放，请检查素材格式", true);
});

previewProgress?.addEventListener("input", () => {
  if (!previewVideo || !activePreviewClip) return;
  const start = clipStart();
  const end = clipEnd();
  const ratio = Number(previewProgress.value || 0) / 1000;
  previewVideo.currentTime = start + Math.max(0, Math.min(1, ratio)) * (end - start);
  updatePreviewTransport();
});

assetUploadInput?.addEventListener("change", () => {
  uploadAssets(assetUploadInput.files);
});

srtUploadInput?.addEventListener("change", () => {
  importSubtitle(srtUploadInput.files);
});

exportOutputDirInput?.addEventListener("change", () => {
  updateOutputDir();
});

[clipStartEpisodeInput, clipEndEpisodeInput, clipTargetInput, singleEpisodeInput, singleTargetInput].forEach((input) => {
  input?.addEventListener("input", () => {
    syncClipConfigSummary();
    scheduleClippingEstimate();
  });
});

modelProviderSelect?.addEventListener("change", updateProviderFields);
asrProviderSelect?.addEventListener("change", updateProviderFields);

[deepseekApiKeyInput, openaiApiKeyInput, openaiAsrApiKeyInput, tencentSecretIdInput, tencentSecretKeyInput, xfyunAppIdInput, xfyunApiKeyInput, xfyunApiSecretInput].forEach((input) => {
  input?.addEventListener("keydown", (event) => {
    if (input.dataset.configuredSecret !== "true") return;
    const editKeys = event.key.length === 1 || event.key === "Backspace" || event.key === "Delete";
    if (!editKeys) return;
    input.value = "";
    input.dataset.configuredSecret = "false";
  });
  input?.addEventListener("paste", () => {
    if (input.dataset.configuredSecret === "true") {
      window.setTimeout(() => {
        input.dataset.configuredSecret = "false";
      }, 0);
    }
  });
});

startClipButton?.addEventListener("click", () => {
  startClipping();
});

syncTrimDecisionAvailability();
loadHomeState();
