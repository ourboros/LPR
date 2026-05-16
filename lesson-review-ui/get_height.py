from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8081/upload.html")
    page.wait_for_selector(".upload-card")
    bbox = page.locator(".upload-card").bounding_box()
    print(f"upload-card height: {bbox['height']}")
    browser.close()
