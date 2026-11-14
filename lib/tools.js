// Outside tools a course links to (from its Canvas menu and its modules), by name. CampusPilot connects to some of
// them; the rest are what students can ask us to add (Home › "Your courses also use…"). Only names leave the
// computer, and only when the student presses Send.
export const TOOLS = [
  ["Gradescope", /gradescope/i, true], ["JupyterHub", /jupyter|datahub|nbgitpuller/i, true], ["Panopto", /panopto/i, true],
  ["Kaltura", /kaltura|mediaspace/i, true], ["YouTube", /youtube\.com|youtu\.be/i, true],
  ["Piazza", /piazza/i], ["Ed Discussion", /edstem|\bed discussion/i], ["Campuswire", /campuswire/i], ["Slack", /slack\.com/i], ["Discord", /discord/i],
  ["zyBooks", /zybooks|zyante/i], ["WebAssign", /webassign/i], ["McGraw Hill Connect", /mheducation|mcgraw|connect\.mheducation/i],
  ["Pearson MyLab / Mastering", /pearson|mylab|mastering(physics|chemistry|biology)?/i], ["Cengage / MindTap", /cengage|mindtap|webassign\.net/i],
  ["Macmillan Achieve", /achieve|macmillan|sapling/i], ["Wiley", /wiley|wileyplus/i], ["W. W. Norton InQuizitive", /inquizitive|wwnorton/i],
  ["Perusall", /perusall/i], ["Hypothesis", /hypothes\.is|hypothesis/i], ["Packback", /packback/i], ["Top Hat", /tophat/i], ["iClicker", /iclicker|reef/i],
  ["Poll Everywhere", /polleverywhere/i], ["PrairieLearn", /prairielearn/i], ["CodePost", /codepost/i], ["GitHub Classroom", /classroom\.github|github\.com/i],
  ["Overleaf", /overleaf/i], ["Labster", /labster/i], ["Zoom", /zoom\.us|\bzoom\b/i], ["YuJa", /yuja/i], ["Echo360", /echo360/i], ["VoiceThread", /voicethread/i],
  ["Course website", /\.edu\/~|\/~[a-z]/i],
];
/** The known tools in a list of labels and links: [{ name, supported }] */
export function toolsIn(texts) {
  const out = new Map();
  for (const t of texts) for (const [name, re, ok] of TOOLS) if (re.test(t)) { out.set(name, !!ok); break; }
  return [...out].map(([name, supported]) => ({ name, supported }));
}
