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
    DEFAULT_CLIP_NAMING: () => DEFAULT_CLIP_NAMING,
    mountExportNamingField: () => mountExportNamingField,
    readExportNaming: () => readExportNaming,
    validateClipNaming: () => validateClipNaming
  });
  var DEFAULT_CLIP_NAMING = "clip_{episode}_{candidate}";
  var validateClipNaming = (raw) => {
    const value = raw.trim();
    if (!value) return "\u8BF7\u8F93\u5165\u6587\u4EF6\u547D\u540D\u89C4\u5219\u3002";
    if (value.length > 160) return "\u547D\u540D\u89C4\u5219\u4E0D\u80FD\u8D85\u8FC7 160 \u4E2A\u5B57\u7B26\u3002";
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u6216\u6587\u4EF6\u540D\u975E\u6CD5\u5B57\u7B26\u3002";
    if (/[{}]/.test(value.replaceAll("{episode}", "").replaceAll("{candidate}", ""))) return "\u4EC5\u652F\u6301 {episode} \u548C {candidate}\uFF0C\u8BF7\u68C0\u67E5\u53D8\u91CF\u662F\u5426\u5B8C\u6574\u3002";
    if (/\.$/.test(value)) return "\u540D\u79F0\u4E0D\u80FD\u4EE5\u70B9\u53F7\u7ED3\u5C3E\u3002";
    if (/\.mp4$/i.test(value)) return "\u65E0\u9700\u586B\u5199 .mp4\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u6DFB\u52A0\u6269\u5C55\u540D\u3002";
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) return "\u8BF7\u52FF\u4F7F\u7528 Windows \u4FDD\u7559\u6587\u4EF6\u540D\u3002";
    return null;
  };
  var mountExportNamingField = (document) => {
    const modal = document.getElementById("exportModal");
    if (!modal || document.getElementById("exportNamingPattern")) return;
    const body = modal.querySelector(".modal-body") ?? modal;
    const field = document.createElement("div");
    field.className = "field";
    field.style.marginTop = "14px";
    const label = document.createElement("label");
    label.htmlFor = "exportNamingPattern";
    label.textContent = "\u6587\u4EF6\u547D\u540D";
    const input = document.createElement("input");
    input.id = "exportNamingPattern";
    input.className = "input";
    input.type = "text";
    input.maxLength = 160;
    input.value = DEFAULT_CLIP_NAMING;
    input.setAttribute("aria-describedby", "exportNamingHint exportNamingError");
    const hint = document.createElement("span");
    hint.id = "exportNamingHint";
    hint.className = "helper";
    hint.style.overflowWrap = "anywhere";
    const error = document.createElement("span");
    error.id = "exportNamingError";
    error.className = "helper";
    error.setAttribute("role", "alert");
    error.hidden = true;
    field.append(label, input, hint, error);
    body.insertBefore(field, body.querySelector(":scope > .package-control"));
    const update = () => {
      const message = validateClipNaming(input.value);
      error.hidden = !message;
      error.textContent = message ?? "";
      input.setAttribute("aria-invalid", String(Boolean(message)));
      hint.textContent = message ? "\u652F\u6301 {episode} \u5206\u96C6\u53F7\u3001{candidate} \u5019\u9009\u7F16\u53F7\uFF1B\u540C\u540D\u81EA\u52A8\u8FFD\u52A0\u7F16\u53F7\u3002" : `\u793A\u4F8B\uFF1A${input.value.trim().replaceAll("{episode}", "01").replaceAll("{candidate}", "ab12cd34")}.mp4\uFF1B\u540C\u540D\u81EA\u52A8\u8FFD\u52A0\u7F16\u53F7\u3002`;
    };
    input.addEventListener("input", update);
    update();
  };
  var readExportNaming = (document) => {
    const input = document.getElementById("exportNamingPattern");
    if (!input) throw new Error("\u6587\u4EF6\u547D\u540D\u914D\u7F6E\u672A\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5BFC\u51FA\u8BBE\u7F6E\u3002");
    const error = validateClipNaming(input.value);
    if (error) {
      input.dispatchEvent(new Event("input"));
      input.focus();
      throw new Error(error);
    }
    return input.value.trim();
  };
  return __toCommonJS(clip_export_naming_field_exports);
})();
