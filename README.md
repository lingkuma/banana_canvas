<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<p align="center">
  <strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Banana Canvas

Banana Canvas is an infinite canvas app for AI image creation and visual organization. It gives you a zoomable, draggable workspace where you can arrange images, notes, text labels, arrows, hand-drawn sketches, and embedded web pages in one place.

The app includes image generation and editing workflows. You can generate new images from text, or select existing images and annotations on the canvas so the model can continue editing based on that visual context. Generated results appear in the history panel and can be added back to the canvas for further iteration.

## Features

• Infinite canvas: pan, zoom, multi-select, drag, rotate, and resize elements.
• WorkFlow: output results automatically serve as inputs for subsequent generations or processing stages.
- Rich canvas elements: notes, images, arrows, labels, drawings, and iframe embeds.
- AI image generation: text-to-image, reference-image editing, and annotated edit instructions.
- Model and API options: Banana / Banana Pro, custom Gemini API keys, and OpenAI-compatible endpoints.
- Generation history: review generation tasks, manage results, and add selected images back to the canvas.
- Creative workflow tools: image upload, drag-and-drop import, undo/redo, trash recovery, and single-image download.

## Use Cases

- Planning AI image workflows and comparing generated results
- Building visual reference boards, moodboards, and creative drafts
- Annotating images with circles, arrows, labels, and edit instructions
- Managing generated images, reference materials, and prompt notes in one workspace

## Tech Stack

- React
- TypeScript
- Vite
- Gemini / Google GenAI SDK
- Tailwind CSS CDN

## Run and Deploy Your AI Studio App

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ad0efd5a-2437-443d-970c-9ca50a8b03d5

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
