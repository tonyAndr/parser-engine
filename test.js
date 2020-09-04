let blacklist = ['medside', 'fb\\.ru', 'youtu', 'wiki', 'yandex', '\.pdf', '\\.docx', '\\.rtf'];
let regex = new RegExp(blacklist.join('|'), 'gi');
console.log(regex);
console.log(regex.test("fbvru"))