# The sandbox image: Node 22 + the agent CLIs + the npm packages the demos use.
# Baking them in means every new sandbox starts in seconds and the live demos
# don't depend on conference Wi-Fi.
FROM node:22
RUN npm i -g @anthropic-ai/claude-code @openai/codex
WORKDIR /workspace
RUN npm init -y > /dev/null \
 && npm i --no-audit --no-fund chart.js@4 @napi-rs/canvas qrcode jsqr pngjs pdfkit @faker-js/faker express cheerio \
 && git init -q /workspace
