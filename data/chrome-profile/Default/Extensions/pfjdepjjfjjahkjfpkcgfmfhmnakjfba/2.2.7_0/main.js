import { createApp } from "vue"
import renderContent from "../src/content/renderContent"
import App from "../src/content/primary/content.vue"

renderContent(globalThis.__CONTENT_SCRIPT_CSS_PLACEHOLDER__, (appRoot) => {
  createApp(App).mount(appRoot)
}).catch(console.log)
