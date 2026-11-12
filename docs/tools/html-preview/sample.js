/* Sample for HTML Preview Online (TOOLCHK3): a made-up 6-file bakery site (page, 2 stylesheets with @import, 3 SVG
   pictures). It links a web font that the preview does not load, a contact page and a script that are not there. */
export const SAMPLE = [
{
"path": "sample-site/index.html",
"type": "text/html",
"text": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Harbor Bakery, fresh bread every morning</title>\n<meta name=\"description\" content=\"A small made-up bakery site to try the HTML preview: a stylesheet with @import, pictures from CSS and img tags, and a web font that is not loaded.\">\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Merriweather&amp;display=swap\">\n<link rel=\"stylesheet\" href=\"css/site.css\">\n<link rel=\"icon\" href=\"img/logo.svg\">\n</head>\n<body>\n<header class=\"top\">\n  <img src=\"img/logo.svg\" alt=\"Harbor Bakery logo\" width=\"48\" height=\"48\">\n  <nav><a href=\"#bread\">Bread</a> <a href=\"#hours\">Hours</a> <a href=\"contact.html\">Contact</a> <a href=\"https://example.com/order\">Order online</a></nav>\n</header>\n<section class=\"hero\">\n  <h1>Fresh bread every morning</h1>\n  <p>Sourdough, rye and seeded loaves, baked before 7 am in a wood oven by the harbor.</p>\n  <a class=\"cta\" href=\"#hours\">See opening hours</a>\n</section>\n<main>\n  <h2 id=\"bread\">Our bread</h2>\n  <div class=\"cards\">\n    <article><img src=\"img/loaf.svg\" alt=\"A round sourdough loaf\"><h3>Sourdough</h3><p>48 hours of slow rise. Crisp crust, open crumb.</p></article>\n    <article><img src=\"img/loaf.svg\"><h3>Dark rye</h3><p>Whole rye with caraway, dense and keeps for a week.</p></article>\n    <article><img src=\"img/loaf.svg\" alt=\"\"><h3>Seeded</h3><p>Sunflower, flax and pumpkin seeds on a wheat dough.</p></article>\n  </div>\n  <h2 id=\"hours\">Opening hours</h2>\n  <table>\n    <tr><th>Monday to Friday</th><td>7:00 to 18:00</td></tr>\n    <tr><th>Saturday</th><td>7:00 to 14:00</td></tr>\n    <tr><th>Sunday</th><td>Closed</td></tr>\n  </table>\n  <h3>Order for a party</h3>\n  <form action=\"https://example.com/send\" method=\"post\">\n    <label>Name <input name=\"name\"></label> <label>Loaves <input name=\"n\" type=\"number\" value=\"4\"></label> <button>Send</button>\n  </form>\n</main>\n<footer>Harbor Bakery, 1 Quay Street. A made-up page for the Zovo HTML Preview sample.</footer>\n<script src=\"js/menu.js\"></script>\n<script>document.querySelector('.cta').textContent = 'Scripts ran';</script>\n</body>\n</html>\n"
},
{
"path": "sample-site/css/base.css",
"type": "text/css",
"text": "body { margin: 0; font: 16px/1.5 Merriweather, Georgia, serif; color: #2d2118; background: #fdf8f1; }\nh2 { color: #6b4a2f; border-bottom: 2px solid #f2b84b; padding-bottom: 4px; }\n"
},
{
"path": "sample-site/css/site.css",
"type": "text/css",
"text": "@import \"base.css\";\n.top { display: flex; align-items: center; gap: 18px; padding: 10px 24px; background: #3b2a1e; }\n.top nav a { color: #f7e7cf; margin-right: 14px; text-decoration: none; }\n.hero { padding: 64px 24px; color: #fff; background: #6b4a2f url(\"../img/hero.svg\") center / cover no-repeat; }\n.hero h1 { margin: 0 0 8px; font-size: 40px; }\n.cta { display: inline-block; margin-top: 12px; padding: 8px 16px; background: #f2b84b; color: #3b2a1e; border-radius: 6px; text-decoration: none; font-weight: 700; }\nmain { padding: 8px 24px 24px; }\n.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }\n.cards article { border: 1px solid #e3d5c3; border-radius: 10px; padding: 12px; background: #fffaf3; }\n.cards img { width: 100%; height: 110px; object-fit: contain; }\ntable { border-collapse: collapse; } th, td { text-align: left; padding: 4px 16px 4px 0; border-bottom: 1px solid #e3d5c3; }\nfooter { padding: 16px 24px; color: #7a6450; font-size: 14px; }\n"
},
{
"path": "sample-site/img/hero.svg",
"type": "image/svg+xml",
"text": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 300\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2f4b6e\"/><stop offset=\"1\" stop-color=\"#e8a35c\"/></linearGradient></defs><rect width=\"800\" height=\"300\" fill=\"url(#g)\"/><path d=\"M0 230q100-30 200 0t200 0 200 0 200 0V300H0z\" fill=\"#1f3550\" opacity=\".8\"/><path d=\"M560 150h90l-10 40h-70z\" fill=\"#3b2a1e\"/><path d=\"M590 150v-60M600 95l40 40h-40z\" stroke=\"#3b2a1e\" stroke-width=\"4\" fill=\"#f7e7cf\"/><circle cx=\"160\" cy=\"80\" r=\"34\" fill=\"#ffd98a\" opacity=\".9\"/></svg>\n"
},
{
"path": "sample-site/img/loaf.svg",
"type": "image/svg+xml",
"text": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 80\"><ellipse cx=\"60\" cy=\"48\" rx=\"52\" ry=\"28\" fill=\"#b97a3f\"/><ellipse cx=\"60\" cy=\"42\" rx=\"48\" ry=\"24\" fill=\"#d39a58\"/><path d=\"M30 34q10 8 20 0M55 30q10 8 20 0M80 34q8 6 14 0\" stroke=\"#8a5428\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/></svg>\n"
},
{
"path": "sample-site/img/logo.svg",
"type": "image/svg+xml",
"text": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><circle cx=\"24\" cy=\"24\" r=\"22\" fill=\"#f2b84b\"/><path d=\"M10 28c4-10 24-10 28 0-6 6-22 6-28 0z\" fill=\"#6b4a2f\"/><path d=\"M17 23l3 4M24 21v5M31 23l-3 4\" stroke=\"#f7e7cf\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>\n"
}
];
