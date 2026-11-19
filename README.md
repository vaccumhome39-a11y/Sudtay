# ค้นหาสินค้า

Product search web app with an interactive graph, buy-together suggestions and a cart.
จัดทำโดย เฟย

The app runs on **GitHub Pages**. It reads live product data from a **private Google Sheet** through a small **Google Apps Script**, so the sheet and its link are never public.

```
Customer ──► yourname.github.io/repo  ──►  Apps Script (runs as you)  ──►  private Google Sheet
```

## Files

| File | What it is |
|---|---|
| `index.html` | The app |
| `config.js` | Settings: paste your Apps Script URL here |
| `data.json` | Backup copy of the products, used until the Apps Script is connected or if it can't be reached |
| `images.json`, `img/` | Product photos (empty for now) |
| `assets/` | Logo files: `logo.svg`/`logo.png` (light backgrounds), `logo-white.*` (dark backgrounds), `logo-mark.*` (icon only, used for the browser tab and phone home screen) |
| `apps-script/Code.gs` | Code to paste into Google Apps Script. It does **not** run on GitHub |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

---

## Step 1: Put the app on GitHub Pages

1. On github.com, click **New repository**, give it a name (e.g. `shop-search`), choose **Public**, and click **Create repository**.
2. Click **uploading an existing file**, drag in **all files and folders** from this zip, then click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then click **Save**.
4. After 1–2 minutes your app is live at `https://YOUR-USERNAME.github.io/shop-search/`.

At this point the app works using `data.json`.

## Step 2: Connect your private Google Sheet

1. Upload your xlsx to Google Drive, open it, and choose **File → Save as Google Sheets**. From now on, edit this Google Sheet. Keep the sheet names `สินค้า` and `กลุ่ม` and the column headers unchanged.
2. Leave the sheet's sharing as **Restricted** (private).
3. Copy the sheet ID from its address: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
4. Go to [script.google.com](https://script.google.com) → **New project**. Delete what's there, paste everything from `apps-script/Code.gs`, and save.
5. Click **Project Settings ⚙ → Script properties → Add script property**: Property `SHEET_ID`, Value = the ID from step 3. Save.
6. Back in the editor, choose the function **testBuild** and click **Run**. Allow access when Google asks. The log should say something like `466 groups, 9925 products`.
7. Click **Deploy → New deployment → ⚙ → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
   
   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## Step 3: Tell the app to use the live data

On GitHub, open `config.js` → ✏️ **Edit**, paste the URL, and click **Commit changes**:

```js
DATA_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

The app now shows **ข้อมูล ณ …** (data as of …) in the top bar, and price or product changes in the sheet appear within about 5 minutes.

---

## Everyday use

- **Change prices or products:** just edit the Google Sheet. Customers see it within 5 minutes. To show it immediately, open the Apps Script and run **clearCache**.
- **Change the Apps Script code later:** use **Deploy → Manage deployments → ✏️ → Version: New version**. This keeps the same URL.
- **Hide a product:** set its `status` to `hide`.
- **Wood prices:** when `QTY2_RATE` is above 0, price = `QTY2_RATE × quantity × PRICE_3`.

## What's private and what's public

- **Private:** your Google Sheet, its link and ID (stored only in Apps Script properties), and every column the app doesn't use (PRICE_1, PRICE_2, PRICE_4, stock, sales dates, hidden products).
- **Public:** the product data the app shows (CODE, NAME, PRICE_3, QTY2_RATE, unit, groups and their descriptions). A customer's browser has to receive this to display it.
- **`data.json` is public too,** because it's in the repository. It contains the same public columns only. Once the live data works, you can replace it with a newer copy, or delete it (then the app shows an error message if the Apps Script is ever down).

## Adding product photos

1. Name each photo after the product **CODE** (replace `/` with `_` and `*` with `+`, e.g. `ก0014/2*` → `ก0014_2+.jpg`) or after the exact **group name** (one photo for the whole group).
2. Resize them to about 800 px wide and upload them into the `img/` folder.
3. List them in `images.json`:

```json
{
  "p": { "ก0034": "img/ก0034.jpg" },
  "g": { "กาวลาเท็กซ์": "img/กาวลาเท็กซ์.jpg" }
}
```

On GitHub Pages, photos can also be full links (`https://...`) to images hosted elsewhere.
