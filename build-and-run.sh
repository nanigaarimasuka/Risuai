git fetch origin
git reset origin/custom --hard
git checkout custom

pnpm build && pm2 restart risuai
