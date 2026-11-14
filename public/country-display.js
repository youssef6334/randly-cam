(function (root) {
    'use strict';
    // Tile order belongs to flags-sprite.webp; independent of language or sort order.
    var INDEX = {"US":0,"GB":1,"AE":2,"SA":3,"FR":4,"DE":5,"CN":6,"JP":7,"IT":8,"ES":9,"RU":10,"IN":11,"BR":12,"CA":13,"AU":14,"KR":15,"TR":16,"EG":17,"MX":18,"QA":19,"KW":20,"NL":21,"SE":22,"CH":23,"AF":24,"AL":25,"AD":26,"AO":27,"AG":28,"AM":29,"AT":30,"AZ":31,"BS":32,"BD":33,"BB":34,"BY":35,"BE":36,"BZ":37,"BJ":38,"BT":39,"BO":40,"BA":41,"BW":42,"BN":43,"BG":44,"BF":45,"BI":46,"KH":47,"CM":48,"CV":49,"CF":50,"TD":51,"CL":52,"CO":53,"KM":54,"CG":55,"CD":56,"CR":57,"CI":58,"HR":59,"CU":60,"CY":61,"CZ":62,"DK":63,"DJ":64,"DM":65,"DO":66,"DZ":67,"EC":68,"SV":69,"GQ":70,"ER":71,"EE":72,"SZ":73,"ET":74,"FJ":75,"FI":76,"GA":77,"GM":78,"GE":79,"GH":80,"GR":81,"GD":82,"GT":83,"GN":84,"GW":85,"GY":86,"HT":87,"HN":88,"HU":89,"IS":90,"IR":91,"IQ":92,"IE":93,"ID":94,"JM":95,"JO":96,"KZ":97,"KE":98,"KI":99,"KP":100,"KG":101,"LA":102,"LV":103,"LB":104,"LS":105,"LR":106,"LY":107,"LI":108,"LT":109,"LU":110,"MG":111,"MW":112,"MY":113,"MV":114,"ML":115,"MT":116,"MH":117,"MR":118,"MA":119,"MU":120,"FM":121,"MD":122,"MC":123,"MN":124,"ME":125,"MZ":126,"MM":127,"NA":128,"NR":129,"NP":130,"NZ":131,"NI":132,"NE":133,"NG":134,"MK":135,"NO":136,"OM":137,"PK":138,"PW":139,"PA":140,"PG":141,"PY":142,"PE":143,"PH":144,"PL":145,"PT":146,"PS":147,"RO":148,"RW":149,"KN":150,"LC":151,"VC":152,"WS":153,"SM":154,"ST":155,"SN":156,"RS":157,"SC":158,"SL":159,"SG":160,"SK":161,"SI":162,"SB":163,"SO":164,"ZA":165,"SS":166,"LK":167,"SD":168,"SR":169,"SY":170,"TW":171,"TJ":172,"TZ":173,"TH":174,"TL":175,"TG":176,"TO":177,"TT":178,"TN":179,"TM":180,"TV":181,"UG":182,"UA":183,"UY":184,"UZ":185,"VU":186,"VE":187,"VN":188,"YE":189,"ZM":190,"ZW":191,"HK":192,"MO":193,"BH":194};
    var CODES = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
    var UNKNOWN = {
        ar: 'الدولة غير معروفة', en: 'Country unavailable', es: 'País no disponible',
        fr: 'Pays indisponible', de: 'Land unbekannt', it: 'Paese non disponibile',
        pt: 'País indisponível', tr: 'Ülke bilinmiyor', ru: 'Страна неизвестна',
        hi: 'देश उपलब्ध नहीं है', id: 'Negara tidak diketahui', zh: '国家未知'
    };
    function normalize(value) {
        if (typeof value !== 'string') return 'global';
        var code = value.trim().toUpperCase();
        return CODES.has(code) ? code : 'global';
    }
    function emoji(value) {
        var code = normalize(value);
        return code === 'global' ? '🌐' : String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397);
    }
    function label(value, locale) {
        var code = normalize(value), language = typeof locale === 'string' ? locale : 'en';
        if (code === 'global') return UNKNOWN[language.toLowerCase().split('-')[0]] || UNKNOWN.en;
        try { return new Intl.DisplayNames([language], { type: 'region' }).of(code) || code; }
        catch (_) { return code; }
    }
    function renderFlag(element, value) {
        if (!element) return;
        var code = normalize(value), index = INDEX[code];
        element.hidden = false;
        element.textContent = '';
        element.classList.add('country-flag');
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        element.setAttribute('aria-hidden', 'true');
        if (code !== 'global' && Number.isInteger(index)) {
            element.style.backgroundImage = 'url("/flags-sprite.webp?v=20261022-1")';
            element.style.backgroundSize = '392px auto';
            element.style.backgroundPosition = (-(index % 14) * 28) + 'px ' + (-Math.floor(index / 14) * 28) + 'px';
        } else element.textContent = emoji(code);
    }
    function renderPartner(value, locale, elements) {
        var code = normalize(value), name = label(code, locale);
        renderFlag(elements.videoFlag, code);
        renderFlag(elements.textFlag, code);
        if (elements.videoName) elements.videoName.textContent = name;
        if (elements.textName) elements.textName.textContent = name;
        return code;
    }
    var api = Object.freeze({ normalize: normalize, emoji: emoji, label: label, renderFlag: renderFlag, renderPartner: renderPartner });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RandlyCountry = api;
})(typeof globalThis === 'undefined' ? window : globalThis);
