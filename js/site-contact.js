const config = window.__PLAYTEST_CONFIG__ ?? {};
document.querySelectorAll("[data-contact-link]").forEach((link) => {
  if (!config.issuesUrl) return;
  link.href = config.issuesUrl;
  link.hidden = false;
});

const copy = document.querySelector("[data-contact-copy]");
if (copy && config.repositoryUrl) {
  copy.textContent =
    "本原型由下方代码仓库的维护者发布。你可以通过 Issues 报告问题、撤回已发送的测试记录或请求删除；请勿在公开 Issue 中粘贴完整测试 JSON。";
}
