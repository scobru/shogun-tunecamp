from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_ui_changes(page: Page):
    # 1. Sidebar Check
    print("Navigating to Home...")
    page.goto("http://localhost:5173/")
    time.sleep(2) # Wait for load

    # Check Sidebar width (approx check via screenshot visual inspection)
    # Check for absence of text labels in sidebar if possible, or just take screenshot
    print("Taking Home screenshot (Sidebar)...")
    page.screenshot(path="/home/jules/verification/home_sidebar.png")

    # 2. Search Check
    print("Navigating to Search...")
    page.goto("http://localhost:5173/search")
    time.sleep(2)

    # Check Search input width
    # We can inspect the element's computed style or class, but visual is key here.
    print("Taking Search screenshot...")
    page.screenshot(path="/home/jules/verification/search_width.png")

    # 3. Artists Check
    print("Navigating to Artists...")
    page.goto("http://localhost:5173/artists")
    time.sleep(2)

    # Check Artist image shape
    print("Taking Artists screenshot...")
    page.screenshot(path="/home/jules/verification/artists_square.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_ui_changes(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
