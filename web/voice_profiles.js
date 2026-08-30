(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ListeningVoiceProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const MAN_NAMES = [
    "aaron","albert","alex","alfie","arthur","brian","bruce","charlie","daniel","david",
    "elliot","ethan","evan","fred","george","gordon","guy","harry","james","jamie","john",
    "lee","liam","mark","martin","matthew","nathan","neil","noah","oliver","peter","ralph",
    "reed","rishi","robert","ryan","thomas","tim","tom","william"
  ];
  const WOMAN_NAMES = [
    "abbi","aria","ava","bella","emily","emma","fiona","grace","hazel","heera","hollie",
    "jenny","joanna","karen","kate","kathy","laura","libby","linda","mia","moira","molly",
    "olivia","samantha","sara","sarah","serena","sonia","susan","sue","tessa","veena",
    "victoria","zira"
  ];

  function voiceText(voice){
    return `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
  }
  function containsName(text, names){
    return names.some(name => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, "i").test(text));
  }
  function genderOf(voice){
    const text = voiceText(voice);
    if (/(^|[^a-z])female([^a-z]|$)/i.test(text)) return "woman";
    if (/(^|[^a-z])male([^a-z]|$)/i.test(text)) return "man";
    if (containsName(text, WOMAN_NAMES)) return "woman";
    if (containsName(text, MAN_NAMES)) return "man";
    // Chrome commonly exposes this voice without a person's name.
    if (/google us english/i.test(text)) return "woman";
    return "unknown";
  }
  function rowsFor(voices, role){
    const rows = voices.map((voice, index) => ({voice, index, gender:genderOf(voice)}));
    if (role === "narrator") return rows;
    const matched = rows.filter(row => row.gender === role);
    if (matched.length) return matched;
    const unknown = rows.filter(row => row.gender === "unknown");
    return unknown.length ? unknown : rows;
  }
  function preferredIndex(rows, role){
    if (!rows.length) return -1;
    const preferred = role === "man"
      ? ["guy","david","daniel","george","ryan","mark","alex","thomas"]
      : role === "woman"
        ? ["jenny","aria","sonia","zira","samantha","libby","karen"]
        : ["aria","susan","libby","daniel","samantha"];
    for (const name of preferred) {
      const row = rows.find(item => containsName(voiceText(item.voice), [name]));
      if (row) return row.index;
    }
    return rows[0].index;
  }
  function counts(voices){
    return voices.reduce((out, voice) => {
      out[genderOf(voice)] += 1;
      return out;
    }, {man:0, woman:0, unknown:0});
  }

  return {genderOf, rowsFor, preferredIndex, counts};
});
