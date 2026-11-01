# 小朋友工具箱

> 给家长和小朋友的免费小工具 · 纯网页、免登录、不收集任何数据

**🌐 在线使用：<https://kid-toolbox.github.io/>**

| 工具 | 在线使用 | 做什么 |
|---|---|---|
| ✍️ 田字格字帖打印 | [/tianzige/](https://kid-toolbox.github.io/tianzige/) | 粘贴生字，生成带笔顺、描红的 A4 练习页 |
| 📝 英文抄写默写打印 | [/sheet/](https://kid-toolbox.github.io/sheet/) | 输入单词，生成正面抄写、反面默写的双面 A4 纸 |
| 🔤 英语单词卡 | [/words/](https://kid-toolbox.github.io/words/) | 粘贴词表，生成单词卡 / 默写纸 / 听写表 |
| 🎮 背单词闯关 | [/words/learn/](https://kid-toolbox.github.io/words/learn/) | 听词选意 → 拼单词 → 排音节 → 看意写 |

## ✍️ 田字格字帖打印

![字帖生成效果](docs/shot-sheet.png)

粘贴课本生字 → 自动生成 A4 练习页：**范字 + 笔顺条 + 空白格**。格子大小 / 每页字数 / 描红格数 / 田字格·米字格 / A4·A5·横向都能调，带拼音、组词、成语和占格提示，点「导出 PDF」就能打印。

## 📝 英文抄写默写打印

![英文抄写默写纸](docs/shot-engsheet.png)

输入这周要学的单词，一键生成 **A4 双面练习纸**：**正面抄写 + 记词，反面看中文默写**。

- **英式音标** —— 和国内教材一致（`yellow /ˈjeləʊ/`），不是美式
- **自然拼读切分** —— `l-igh-t`、`sea-shell`，让孩子看见"哪几个字母发哪个音"
- **记忆点**
  - 合成词拆解：`sea + shell`、`jelly + fish`
  - 常用搭配：`a grain of sand` 一粒沙
  - 不发音字母：`light` 的 `gh`、`write` 的 `w`
  - 只在真有钩子时才给，不硬凑
- **难度（CEFR）** —— 按小学低中高年级和日常使用场景逐词判断：A1 入门、A2 基础、B1 进阶
- **词频（★）** —— 来自 [ECDICT](https://github.com/skywind3000/ECDICT) 的 BNC / COCA 排名：前 1,000 / 3,000 / 10,000 名分别给 ★★★ / ★★ / ★；10,000 名以外或专有名词显示 ☆，认识就行

## 🔤 英语单词卡

![英语单词卡](docs/shot-words.png)

粘贴课本词表，生成 **单词卡 / 默写纸 / 听写表**。每张卡带英式音标、拆音节、中文和例句，点 🔊 就能朗读；支持复制分享链接，换台设备打开还是同一份词表。

## 🎮 背单词闯关

![背单词闯关](docs/shot-learn.png)

听词选意思 → 拼单词 → 排音节 → 看意思写，**一关一个词**。答对有星星和撒花，答错不扣分；答错的词自动记进「生词本」，可以一键做成默写纸打印。

## 数据来源与授权

| 内容 | 来源 | 授权 |
|---|---|---|
| 汉字笔画 / 中心线 | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) → [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) | Arphic Public License（见 `ARPHICPL.TXT`） |
| 拼音 | [pinyin-data](https://github.com/mozillazg/pinyin-data) | MIT |
| 英汉释义 / 音标 / 词性 | [ECDICT](https://github.com/skywind3000/ECDICT) 筛出常用 5000 词 | MIT |
| 词组 / 成语 / 占格提示 | 本项目整理（一年级上册第一课 16 字） | 随本项目 |

代码为 MIT（见 `LICENSE`）；再次分发请保留 `ARPHICPL.TXT` 和 `NOTICE`。
