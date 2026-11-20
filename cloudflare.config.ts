import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "project-nomad",
    "compatibilityDate": "2026-11-17",
    "observability": {
      "enabled": true
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    },
    "domains": ["nomad.stevecrouse.net"]
  }
});
