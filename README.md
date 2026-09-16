# Dulwich TTC — AI Admin Chatbot

Yeh system aapki maujooda Dulwich TTC static site (GitHub → Vercel) ke sath hi deploy hota hai, aur `/admin` par ek password-protected chatbot dashboard add kar deta hai. Aap chatbot ko plain Roman Urdu/English me batayein ke kis page ke kis section me kya text ya image change/add karni hai — woh khud actual HTML file update karke GitHub par commit kar deta hai, jisse Vercel automatically redeploy kar deta hai (1-2 minute me live).

## Yeh kaise kaam karta hai (short version)

1. Har HTML page (`index.html`, `services.html`, `membership.html`, ...) ke andar, editable spots (headings, paragraphs, testimonials, FAQ, images, phone/email) ko invisible `<!--EDIT:...-->` markers se tag kiya gaya hai — total **314 spots**, poori site me. Yeh markers browser me kabhi nazar nahi aate, sirf HTML source me hote hain.
2. `manifest.json` in sab 314 spots ki ek list rakhta hai (kis page, kis section, kya type, current content ka preview).
3. Jab aap chat me kuch likhte hain, backend AI (OpenAI ya Anthropic) ko aapka message + poori manifest list deta hai. AI decide karta hai konsa spot match karta hai aur naya content kya hoga.
4. Backend us exact spot ko us page ki file me dhoondh kar update karta hai, aur GitHub par ek naya commit push kar deta hai (jaisे aap khud GitHub par file edit karke commit karte). Vercel apne aap redeploy kar deta hai.
5. Naya image upload karne par, wo image `uploads/` folder me GitHub repo ke andar save hoti hai aur us section ka `src` us par point kar diya jata hai.

Koi database nahi chahiye — sab kuch aapke maujooda GitHub + Vercel setup ke andar hi hota hai.

## Setup — pehli baar

### 1. GitHub token banayein
GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → New token.
- Repository access: sirf isi Dulwich TTC repo ko select karein
- Permissions: **Contents → Read and write**
- Token generate karke copy kar lein (dobara nahi dikhega)

### 2. Yeh files apne GitHub repo me daal dein
Is zip ke andar jo bhi hai (`index.html`, `services.html`, ... `admin/`, `api/`, `vercel.json`, `package.json`) — apne maujooda Dulwich TTC repo me **replace** kar dein (purani HTML files ki jagah yeh nayi wali, jin me markers already add ho chuke hain), phir commit + push karein.

> Zaroori: purani files ko in se replace karein, merge na karein — kyunke inme markers already precisely add kiye ja chuke hain.

### 3. Vercel me environment variables set karein
Vercel Dashboard → aapka project → Settings → Environment Variables — `.env.example` file me di gayi saari values add karein:

| Variable | Kya hai |
|---|---|
| `ADMIN_PASSWORD` | Admin panel ka login password (strong rakhein — jis ke paas yeh ho woh live site edit kar sakta hai) |
| `SESSION_SECRET` | Koi bhi lamba random string (login session sign karne ke liye) |
| `GITHUB_OWNER` | Aapka GitHub username/org |
| `GITHUB_REPO` | Repo ka naam |
| `GITHUB_BRANCH` | Aam taur par `main` |
| `GITHUB_TOKEN` | Step 1 wala token |
| `OPENAI_API_KEY` **ya** `ANTHROPIC_API_KEY` | Jo bhi aapke paas hai, ek hi kaafi hai |

Save karke Vercel ko redeploy karein (ya bas naya push hi redeploy trigger kar dega).

### 4. Try karein
`https://www.dulwichttc.com/admin` par jayein, password daalein, aur chat karna shuru karein.

## Kya likh sakte hain (examples)

- "Home page ke about section ka text yeh kar do: [naya text]"
- "Contact page ka phone number 07123456789 kar do" — yeh sab pages par ek sath update ho jayega (phone number har page ke header me repeat hota hai)
- "FAQ me naya sawal add karo: Q: ... A: ..."
- "Home page ke testimonials me ek naya review add karo: [text], naam: ..., role: ..."
- Image change karne ke liye: pehle 📎 se photo attach karein, phir likhein "yeh photo coaches section ke Abdul wali image ki jagah laga do" — agar AI confirm na kar paye to woh pooch lega konsi image.

Agar AI ko exact spot samajh na aaye, wo aapse clarify karega (guess laga kar galat jagah update nahi karega).

## Limitations (abhi ke liye)

- Sirf woh 314 spots edit ho sakte hain jo already marked hain — yeh site ke tamam headings, paragraphs, testimonials, FAQ, images, aur phone/email links cover karte hain.
- Naye items add karna sirf teen jagah supported hai: FAQ list, Testimonials list, aur Home page ki Gallery — inme AI naya card khud template ke mutabiq bana kar add kar deta hai.
- Bilkul nayi section ya page banana (jo pehle se site me nahi) is chatbot se possible nahi — us ke liye normal development chahiye hoga.
- Har AI message ki thodi si cost hoti hai (OpenAI/Anthropic ke hisaab se) — `gpt-4o-mini` ya `claude-3-5-haiku` use karne se yeh negligible rehti hai (default `AI_MODEL` isi ke liye set hai).

## Security note

`ADMIN_PASSWORD` sirf trusted logon (aap, ya jisay aap dein) ke sath share karein — jo bhi is password se login karega woh seedha live client site edit kar sakta hai.
