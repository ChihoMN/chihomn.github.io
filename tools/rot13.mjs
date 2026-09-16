// 邮箱 ROT13 编码小工具（ROT13 是自反的：编码和解码是同一个操作）
//
//   node tools/rot13.mjs you@example.com      编码
//   node tools/rot13.mjs lbh@rknzcyr.pbz      解码（同一命令）
//
// 为什么用 ROT13：编码结果里不含 @ 字符，靠正则抓邮箱的爬虫拿不到东西；
// 而读者只要有提示就能自己解（或随手搜一个 ROT13 在线工具）。

const input = process.argv.slice(2).join(" ");

if (!input) {
  console.error("用法: node tools/rot13.mjs <文本>");
  process.exit(1);
}

const rot13 = (s) =>
  s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const out = rot13(input);

console.log(out);
console.error(`\n  原文: ${input}`);
console.error(`  结果: ${out}`);
console.error(`  含 @ 字符: ${out.includes("@") ? "是（注意：@ 不参与 ROT13，会原样保留）" : "否"}`);
