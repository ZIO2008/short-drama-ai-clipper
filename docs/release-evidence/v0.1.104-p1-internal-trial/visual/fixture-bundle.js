var NamingFixture = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/renderer/src/pages/clip-export-naming-field.ts
  var clip_export_naming_field_exports = {};
  __export(clip_export_naming_field_exports, {
    ClipNamingInputError: () => ClipNamingInputError,
    DEFAULT_CLIP_NAMING: () => DEFAULT_CLIP_NAMING,
    mountExportNamingField: () => mountExportNamingField,
    readExportNaming: () => readExportNaming,
    validateClipNaming: () => validateClipNaming
  });
  var DEFAULT_CLIP_NAMING = "\u7B2C{episode}\u96C6_\u5207\u7247";
  var ClipNamingInputError = class extends Error {
  };
  var validateClipNaming = (raw) => {
    const value = raw.trim();
    if (!value) return "\u8BF7\u8F93\u5165\u6587\u4EF6\u547D\u540D\u89C4\u5219\u3002";
    if (value.length > 160) return "\u547D\u540D\u89C4\u5219\u4E0D\u80FD\u8D85\u8FC7 160 \u4E2A\u5B57\u7B26\u3002";
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u6216\u6587\u4EF6\u540D\u975E\u6CD5\u5B57\u7B26\u3002";
    if (/[{}]/.test(value.replaceAll("{episode}", "").replaceAll("{candidate}", ""))) return "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u5927\u62EC\u53F7\uFF0C\u8BF7\u76F4\u63A5\u586B\u5199\u6587\u5B57\u3002";
    if (/\.$/.test(value)) return "\u540D\u79F0\u4E0D\u80FD\u4EE5\u70B9\u53F7\u7ED3\u5C3E\u3002";
    if (/\.mp4$/i.test(value)) return "\u65E0\u9700\u586B\u5199 .mp4\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u6DFB\u52A0\u6269\u5C55\u540D\u3002";
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) return "\u8BE5\u540D\u79F0\u4E3A\u7CFB\u7EDF\u4FDD\u7559\u540D\u79F0\uFF0C\u8BF7\u6362\u4E00\u4E2A\u3002";
    return null;
  };
  var namingFor = (mode, rawPrefix) => {
    if (mode === "episode") return DEFAULT_CLIP_NAMING;
    if (mode !== "prefix") throw new Error("\u8BF7\u9009\u62E9\u547D\u540D\u65B9\u5F0F\u3002");
    const prefix = rawPrefix.trim();
    if (!prefix) throw new Error("\u8BF7\u8F93\u5165\u5267\u540D\u6216\u524D\u7F00\uFF0C\u6216\u8005\u9009\u62E9\u9ED8\u8BA4\u547D\u540D\u3002");
    if (prefix.length > 120) throw new Error("\u5267\u540D\u6216\u524D\u7F00\u4E0D\u80FD\u8D85\u8FC7 120 \u4E2A\u5B57\u3002");
    if (/[{}]/.test(prefix)) throw new Error("\u8BF7\u76F4\u63A5\u586B\u5199\u5267\u540D\u6216\u524D\u7F00\uFF0C\u4E0D\u7528\u586B\u5199\u5927\u62EC\u53F7\u89C4\u5219\u3002");
    const error = validateClipNaming(prefix);
    if (error) throw new Error(error);
    return `${prefix}_${DEFAULT_CLIP_NAMING}`;
  };
  var mountExportNamingField = (document) => {
    const modal = document.getElementById("exportModal");
    if (!modal || document.getElementById("exportNamingMode")) return;
    const body = modal.querySelector(".modal-body") ?? modal;
    const field = document.createElement("div");
    field.className = "field";
    field.style.marginTop = "14px";
    field.id = "exportNamingFields";
    const label = document.createElement("label");
    label.htmlFor = "exportNamingMode";
    label.textContent = "\u6587\u4EF6\u547D\u540D";
    const mode = document.createElement("select");
    mode.id = "exportNamingMode";
    mode.className = "select";
    mode.setAttribute("aria-describedby", "exportNamingHint exportNamingError");
    for (const [value, text] of [["episode", "\u6309\u5206\u96C6\u547D\u540D\uFF08\u9ED8\u8BA4\uFF09"], ["prefix", "\u52A0\u5267\u540D\u6216\u524D\u7F00"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      mode.append(option);
    }
    const prefixGroup = document.createElement("div");
    prefixGroup.className = "field";
    const prefixLabel = document.createElement("label");
    prefixLabel.htmlFor = "exportNamingPrefix";
    prefixLabel.textContent = "\u5267\u540D\u6216\u524D\u7F00";
    const input = document.createElement("input");
    input.id = "exportNamingPrefix";
    input.className = "input";
    input.type = "text";
    input.maxLength = 120;
    input.placeholder = "\u4F8B\u5982\uFF1A\u7834\u8327\u4E4B\u540E";
    input.setAttribute("aria-describedby", "exportNamingHint exportNamingError");
    prefixGroup.append(prefixLabel, input);
    const hint = document.createElement("span");
    hint.id = "exportNamingHint";
    hint.className = "helper";
    hint.style.overflowWrap = "anywhere";
    const error = document.createElement("span");
    error.id = "exportNamingError";
    error.className = "helper";
    error.setAttribute("role", "alert");
    error.hidden = true;
    field.append(label, mode, prefixGroup, hint, error);
    body.insertBefore(field, body.querySelector(":scope > .package-control"));
    const update = () => {
      const custom = mode.value === "prefix";
      prefixGroup.hidden = !custom;
      prefixGroup.style.display = custom ? "" : "none";
      input.disabled = !custom;
      let message = null;
      let pattern = DEFAULT_CLIP_NAMING;
      try {
        pattern = namingFor(mode.value, input.value);
      } catch (cause) {
        message = cause instanceof Error ? cause.message : "\u8BF7\u68C0\u67E5\u547D\u540D\u65B9\u5F0F\u3002";
      }
      error.hidden = !message;
      error.textContent = message ?? "";
      input.setAttribute("aria-invalid", String(Boolean(message)));
      hint.textContent = message ? "\u7CFB\u7EDF\u81EA\u52A8\u8865\u5206\u96C6\u53F7\u548C\u6269\u5C55\u540D\uFF0C\u540C\u540D\u81EA\u52A8\u52A0\u7F16\u53F7\u3002" : `\u6587\u4EF6\u540D\u793A\u4F8B\uFF1A${pattern.replaceAll("{episode}", "01")}.mp4\uFF1B\u540C\u540D\u81EA\u52A8\u52A0\u7F16\u53F7\u3002`;
    };
    mode.addEventListener("change", update);
    input.addEventListener("input", update);
    update();
  };
  var readExportNaming = (document) => {
    const mode = document.getElementById("exportNamingMode");
    const input = document.getElementById("exportNamingPrefix");
    if (!mode || !input) throw new Error("\u6587\u4EF6\u547D\u540D\u914D\u7F6E\u672A\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5BFC\u51FA\u8BBE\u7F6E\u3002");
    try {
      return namingFor(mode.value, input.value);
    } catch (error) {
      input.dispatchEvent(new Event("input"));
      (mode.value === "prefix" ? input : mode).focus();
      throw new ClipNamingInputError(error instanceof Error ? error.message : "\u8BF7\u68C0\u67E5\u547D\u540D\u65B9\u5F0F\u3002");
    }
  };
  return __toCommonJS(clip_export_naming_field_exports);
})();
