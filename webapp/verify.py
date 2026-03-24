from playwright.sync_api import Page, expect, sync_playwright
import time
import os

def verify_feature(page: Page):
  page.goto("http://localhost:5173")
  page.wait_for_timeout(3000)

  page.screenshot(path="/home/jules/verification/home.png")

if __name__ == "__main__":
  os.makedirs("/home/jules/verification/video", exist_ok=True)
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(record_video_dir="/home/jules/verification/video")
    page = context.new_page()
    try:
      verify_feature(page)
    finally:
      context.close()
      browser.close()
