/* RoundNotes — bedside calculators and diagnostic tools (v0.8).
   Each calculator: id, name, cat (category), specs (specialties it is listed under), fields, calc(values) → result or null.
   Field types: num (default), seg (choice buttons), chk (tick box, worth pts), sel (dropdown).
   pre(P) fills a field from the patient's record: P.age, P.sex, P.weight, P.height, P.bmi, P.lab(key), P.vit(key), P.has(...), P.medHas(regex).
   Result: { main, lines[], level ('ok' | 'warn' | 'high'), text (one line saved to the patient) }. */
'use strict';

const CALC_CATS = ['Kidney', 'Acid–base & fluids', 'Heart', 'Lung', 'ICU & neuro', 'Blood', 'Liver & GI', 'Oncology', 'Allergy & immunology', 'Geriatrics', 'Neurology', 'Infection', 'Endocrine & metabolic', 'Rheumatology', 'Body size'];
const ALL_SPECS = ['Nephrology', 'Cardiology', 'ICU', 'Pulmonary', 'Hematology', 'Endocrine', 'Rheumatology', 'Gastroenterology', 'Oncology', 'Allergy & Immunology', 'Geriatrics', 'Neurology', 'Infectious Diseases'];

const r0 = v => Math.round(v);
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const lc1 = t => t.charAt(0).toLowerCase() + t.slice(1);
const has = v => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v));
const SEX = { k: 'sex', l: 'Sex', t: 'seg', opts: [['M', 'Male'], ['F', 'Female']], pre: P => P.sex };
const AGE = { k: 'age', l: 'Age', u: 'years', pre: P => P.age };
const WT = { k: 'wt', l: 'Weight', u: 'kg', pre: P => P.weight };
const HT = { k: 'ht', l: 'Height', u: 'cm', pre: P => P.height };
const LAB = (k, l, u, key, extra) => Object.assign({ k, l, u, pre: P => P.lab(key || k) }, extra || {});

function egfrCalc(cr, age, sex) {
  const F = sex === 'F', kk = F ? 0.7 : 0.9, a = F ? -0.241 : -0.302, r = cr / kk;
  let e = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, age);
  if (F) e *= 1.012;
  return e;
}
const gStage = e => e >= 90 ? 'G1' : e >= 60 ? 'G2' : e >= 45 ? 'G3a' : e >= 30 ? 'G3b' : e >= 15 ? 'G4' : 'G5';

function anionGap(v) {
  if (![v.na, v.cl, v.hco3].every(has)) return null;
  const ag = v.na - v.cl - v.hco3;
  const agc = has(v.alb) ? ag + 2.5 * (4 - v.alb) : null;
  return { ag, agc, use: agc !== null ? agc : ag };
}

function interpretABG(v) {
  const { ph, pco2, hco3 } = v;
  if (![ph, pco2, hco3].every(has)) return null;
  const lines = [];
  let main = '', level = 'warn';
  // Internal consistency (Henderson): [H+] = 24 × pCO2 / HCO3
  const phCalc = 9 - Math.log10(24 * pco2 / hco3);
  if (Math.abs(phCalc - ph) > 0.04) lines.push(`⚠ pH, pCO2 and HCO3 don't match (calculated pH ${r2(phCalc)}) — check the values or the sample.`);
  const acid = ph < 7.35, alk = ph > 7.45;
  const lowH = hco3 < 22, highH = hco3 > 26, highC = pco2 > 45, lowC = pco2 < 35;
  let primary = null;
  if (acid) {
    if (lowH && highC) main = 'Mixed metabolic and respiratory acidosis';
    else if (lowH) primary = 'metacid';
    else if (highC) primary = 'respacid';
    else main = 'Acidemia without a matching HCO3 or pCO2 change — check the values';
  } else if (alk) {
    if (highH && lowC) main = 'Mixed metabolic and respiratory alkalosis';
    else if (highH) primary = 'metalk';
    else if (lowC) primary = 'respalk';
    else main = 'Alkalemia without a matching HCO3 or pCO2 change — check the values';
  } else {
    if (highC && highH) main = 'Normal pH with high pCO2 and high HCO3: respiratory acidosis + metabolic alkalosis (or a fully compensated disorder)';
    else if (lowC && lowH) main = 'Normal pH with low pCO2 and low HCO3: respiratory alkalosis + metabolic acidosis (or a fully compensated disorder)';
    else if (!highC && !lowC && !highH && !lowH) { main = 'Normal acid–base values'; level = 'ok'; }
    else main = 'Normal pH with an isolated pCO2 or HCO3 change — likely a mixed or compensated disorder';
  }
  if (primary === 'metacid') {
    const exp = 1.5 * hco3 + 8;
    main = 'Primary metabolic acidosis';
    lines.push(`Expected pCO2 (Winter's formula) ${r0(exp - 2)}–${r0(exp + 2)} mmHg`);
    if (pco2 > exp + 2) lines.push('pCO2 higher than expected → additional respiratory acidosis');
    else if (pco2 < exp - 2) lines.push('pCO2 lower than expected → additional respiratory alkalosis');
    else lines.push('Appropriate respiratory compensation');
  } else if (primary === 'metalk') {
    const exp = 0.7 * hco3 + 21;
    main = 'Primary metabolic alkalosis';
    lines.push(`Expected pCO2 ${r0(exp - 2)}–${r0(exp + 2)} mmHg`);
    if (pco2 > exp + 2) lines.push('pCO2 higher than expected → additional respiratory acidosis');
    else if (pco2 < exp - 2) lines.push('pCO2 lower than expected → additional respiratory alkalosis');
    else lines.push('Appropriate respiratory compensation');
  } else if (primary === 'respacid') {
    const acute = 24 + 0.1 * (pco2 - 40), chronic = 24 + 0.35 * (pco2 - 40);
    main = 'Primary respiratory acidosis';
    lines.push(`Expected HCO3: acute ${r0(acute)}, chronic ${r0(chronic)} mmol/L`);
    if (hco3 < acute - 2) lines.push('HCO3 lower than expected → additional metabolic acidosis');
    else if (hco3 > chronic + 2) lines.push('HCO3 higher than expected → additional metabolic alkalosis');
    else if (Math.abs(hco3 - acute) <= 2) lines.push('Fits an acute respiratory acidosis');
    else if (Math.abs(hco3 - chronic) <= 2) lines.push('Fits a chronic (compensated) respiratory acidosis');
    else lines.push('Between acute and chronic → acute-on-chronic respiratory acidosis');
  } else if (primary === 'respalk') {
    const acute = 24 - 0.2 * (40 - pco2), chronic = 24 - 0.4 * (40 - pco2);
    main = 'Primary respiratory alkalosis';
    lines.push(`Expected HCO3: acute ${r0(acute)}, chronic ${r0(chronic)} mmol/L`);
    if (hco3 > acute + 2) lines.push('HCO3 higher than expected → additional metabolic alkalosis');
    else if (hco3 < chronic - 2) lines.push('HCO3 lower than expected → additional metabolic acidosis');
    else if (Math.abs(hco3 - acute) <= 2) lines.push('Fits an acute respiratory alkalosis');
    else if (Math.abs(hco3 - chronic) <= 2) lines.push('Fits a chronic (compensated) respiratory alkalosis');
    else lines.push('Between acute and chronic compensation');
  }
  const g = anionGap(v);
  const allNormal = !acid && !alk && !highC && !lowC && !highH && !lowH;
  if (g) {
    const label = g.agc !== null ? `Anion gap ${r0(g.ag)} (albumin-corrected ${r1(g.agc)})` : `Anion gap ${r0(g.ag)}`;
    if (g.use > 12) {
      const da = deltaAnalysis(g, hco3);
      lines.push(`${label} → high anion gap metabolic acidosis${primary === 'metacid' ? '' : ' is also present'}`);
      lines.push(...da.lines);
      // The gap changes the verdict, not just the notes.
      const hasAlk = primary === 'metalk' || /metabolic alkalosis/.test(main);
      if (primary === 'metacid') main = da.alk ? 'High anion gap metabolic acidosis + metabolic alkalosis' : da.nagma ? 'Mixed high and normal anion gap metabolic acidosis' : 'High anion gap metabolic acidosis';
      else if (allNormal) {
        main = da.alk ? 'Hidden mixed disorder: high anion gap metabolic acidosis + metabolic alkalosis' : 'Normal pH, pCO2 and HCO3, but the anion gap is raised';
        lines.unshift(da.alk ? 'pH, pCO2 and HCO3 look normal because the two metabolic disorders cancel out (e.g. vomiting or diuretics with lactic or ketoacidosis, or kidney failure)' : 'Check the gap again with fresh electrolytes');
        level = da.alk ? 'high' : 'warn';
      } else if (!acid && !alk) {
        if (lowC && lowH) main = `Normal pH: respiratory alkalosis + high anion gap metabolic acidosis${da.alk ? ' + metabolic alkalosis' : ''}`;
        else if (highC && highH) main = 'Normal pH: respiratory acidosis + metabolic alkalosis + high anion gap metabolic acidosis';
        else main = da.alk ? 'Mixed high anion gap metabolic acidosis + metabolic alkalosis (normal pH)' : 'High anion gap metabolic acidosis with a normal pH — look for a second disorder';
      } else if (/^Mixed metabolic and respiratory acidosis/.test(main)) main = `Mixed high anion gap metabolic acidosis + respiratory acidosis${da.alk ? ' + metabolic alkalosis' : ''}`;
      else main += ` + high anion gap metabolic acidosis${da.alk && !hasAlk ? ' + metabolic alkalosis' : ''}`;
      if (level === 'ok') level = 'warn';
    } else if (primary === 'metacid') lines.push(`${label} → normal anion gap (hyperchloremic) acidosis`);
    else lines.push(label);
  } else if (primary === 'metacid') lines.push('Add Na and Cl to check the anion gap');
  else if (allNormal) lines.push('Add Na and Cl: a normal blood gas can still hide a high anion gap acidosis with a metabolic alkalosis');
  if (has(v.po2)) {
    let fio2 = has(v.fio2) ? v.fio2 : 21;
    if (fio2 > 1) fio2 = fio2 / 100;
    const pf = v.po2 / fio2;
    const pAO2 = fio2 * (760 - 47) - pco2 / 0.8;
    const aa = pAO2 - v.po2;
    const expAa = has(v.age) ? v.age / 4 + 4 : null;
    lines.push(`Oxygenation: P/F ${r0(pf)}${pf <= 100 ? ' (severe impairment)' : pf <= 200 ? ' (moderate impairment)' : pf <= 300 ? ' (mild impairment)' : ''}`);
    lines.push(`A–a gradient ${r0(aa)} mmHg${expAa !== null ? ` (expected ≤${r0(expAa)} for age)` : ''}${expAa !== null && aa > expAa ? ' → raised: V/Q mismatch, shunt or diffusion problem' : ''}`);
    if (v.po2 < 60) lines.push('pO2 <60 mmHg → respiratory failure range');
  }
  return { main, lines, level, text: `ABG pH ${ph}, pCO2 ${pco2}, HCO3 ${hco3}: ${main}${lines.length ? '; ' + lines.filter(x => !x.startsWith('⚠')).join('; ') : ''}` };
}
function deltaText(dr) {
  if (dr < 0.4) return 'normal anion gap (hyperchloremic) acidosis';
  if (dr < 0.8) return 'combined high and normal anion gap acidosis';
  if (dr <= 2) return 'pure high anion gap acidosis';
  return 'high anion gap acidosis plus metabolic alkalosis (or pre-existing compensated respiratory acidosis)';
}
// Raised anion gap: compare the rise in the gap with the fall in HCO3. A normal (or high) HCO3 with a clearly raised
// gap means a metabolic alkalosis is hiding the acidosis — pH, pCO2 and HCO3 can then all look normal.
function deltaAnalysis(g, hco3) {
  const dAG = g.use - 12, dH = 24 - hco3, pre = hco3 + dAG;
  const preLine = `HCO3 before the extra acid ≈ ${r0(pre)} mmol/L (HCO3 ${hco3} + ΔAG ${r1(dAG)})`;
  if (dH <= 0) {
    if (dAG >= 4) return { ratio: null, alk: true, nagma: false, lines: [`The gap rose by ${r1(dAG)} but HCO3 has not fallen (${hco3}) → a metabolic alkalosis is also present`, `${preLine} — above normal`] };
    return { ratio: null, alk: false, nagma: false, lines: ['Gap only slightly raised with a normal HCO3 — recheck; it may be lab variation'] };
  }
  const ratio = dAG / dH, out = { ratio, alk: ratio > 2, nagma: ratio < 0.8, lines: [`Delta ratio ${r2(ratio)} (ΔAG ${r1(dAG)} / ΔHCO3 ${r1(dH)}) → ${deltaText(ratio)}`] };
  if (out.alk) out.lines.push(`${preLine} — above normal`);
  if (out.nagma) out.lines.push(`${preLine} — HCO3 was already low before the gap rose`);
  return out;
}

// ---- AHA PREVENT equations (Khan SS et al., Circulation 2024;149:430–49): base and base + UACR models, 10-year and 30-year ----
const PREVENT_COEF = {
  base_10yr: {terms: ['age', 'non_hdl_c', 'hdl_c', 'sbp_lt_110', 'sbp_gte_110', 'dm', 'smoking', 'bmi_lt_30', 'bmi_gte_30', 'egfr_lt_60', 'egfr_gte_60', 'bp_tx', 'statin', 'bp_tx_sbp_gte_110', 'statin_non_hdl_c', 'age_non_hdl_c', 'age_hdl_c', 'age_sbp_gte_110', 'age_dm', 'age_smoking', 'age_bmi_gte_30', 'age_egfr_lt_60', 'constant'],
    female_total_cvd: [0.7939329,0.0305239,-0.1606857,-0.2394003,0.3600781,0.8667604,0.5360739,0.0,0.0,0.6045917,0.0433769,0.3151672,-0.1477655,-0.0663612,0.1197879,-0.0819715,0.0306769,-0.0946348,-0.27057,-0.078715,0.0,-0.1637806,-3.307728],
    male_total_cvd: [0.7688528,0.0736174,-0.0954431,-0.4347345,0.3362658,0.7692857,0.4386871,0.0,0.0,0.5378979,0.0164827,0.288879,-0.1337349,-0.0475924,0.150273,-0.0517874,0.0191169,-0.1049477,-0.2251948,-0.0895067,0.0,-0.1543702,-3.031168],
    female_ascvd: [0.719883,0.1176967,-0.151185,-0.0835358,0.3592852,0.8348585,0.4831078,0.0,0.0,0.4864619,0.0397779,0.2265309,-0.0592374,-0.0395762,0.0844423,-0.0567839,0.0325692,-0.1035985,-0.2417542,-0.0791142,0.0,-0.1671492,-3.819975],
    male_ascvd: [0.7099847,0.1658663,-0.1144285,-0.2837212,0.3239977,0.7189597,0.3956973,0.0,0.0,0.3690075,0.0203619,0.2036522,-0.0865581,-0.0322916,0.114563,-0.0300005,0.0232747,-0.0927024,-0.2018525,-0.0970527,0.0,-0.1217081,-3.500655],
    female_heart_failure: [0.8998235,0.0,0.0,-0.4559771,0.3576505,1.038346,0.583916,-0.0072294,0.2997706,0.7451638,0.0557087,0.3534442,0.0,-0.0981511,0.0,0.0,0.0,-0.0946663,-0.3581041,-0.1159453,-0.003878,-0.1884289,-4.310409],
    male_heart_failure: [0.8972642,0.0,0.0,-0.6811466,0.3634461,0.923776,0.5023736,-0.0485841,0.3726929,0.6926917,0.0251827,0.2980922,0.0,-0.0497731,0.0,0.0,0.0,-0.1289201,-0.3040924,-0.1401688,0.0068126,-0.1797778,-3.946391]},
  base_30yr: {terms: ['age', 'age_squared', 'non_hdl_c', 'hdl_c', 'sbp_lt_110', 'sbp_gte_110', 'dm', 'smoking', 'bmi_lt_30', 'bmi_gte_30', 'egfr_lt_60', 'egfr_gte_60', 'bp_tx', 'statin', 'bp_tx_sbp_gte_110', 'statin_non_hdl_c', 'age_non_hdl_c', 'age_hdl_c', 'age_sbp_gte_110', 'age_dm', 'age_smoking', 'age_bmi_gte_30', 'age_egfr_lt_60', 'constant'],
    female_total_cvd: [0.5503079,-0.0928369,0.0409794,-0.1663306,-0.1628654,0.3299505,0.6793894,0.3196112,0.0,0.0,0.1857101,0.0553528,0.2894,-0.075688,-0.056367,0.1071019,-0.0751438,0.0301786,-0.0998776,-0.3206166,-0.1607862,0.0,-0.1450788,-1.318827],
    male_total_cvd: [0.4627309,-0.0984281,0.0836088,-0.1029824,-0.2140352,0.2904325,0.5331276,0.2141914,0.0,0.0,0.1155556,0.0603775,0.232714,-0.0272112,-0.0384488,0.134192,-0.0511759,0.0165865,-0.1101437,-0.2585943,-0.1566406,0.0,-0.1166776,-1.148204],
    female_ascvd: [0.4669202,-0.0893118,0.1256901,-0.1542255,-0.0018093,0.322949,0.6296707,0.268292,0.0,0.0,0.100106,0.0499663,0.1875292,0.0152476,-0.0276123,0.0736147,-0.0521962,0.0316918,-0.1046101,-0.2727793,-0.1530907,0.0,-0.1299149,-1.974074],
    male_ascvd: [0.3994099,-0.0937484,0.1744643,-0.120203,-0.0665117,0.2753037,0.4790257,0.1782635,0.0,0.0,-0.0218789,0.0602553,0.1421182,0.0135996,-0.0218265,0.1013148,-0.0312619,0.020673,-0.0920935,-0.2159947,-0.1548811,0.0,-0.0712547,-1.736444],
    female_heart_failure: [0.6254374,-0.0983038,0.0,0.0,-0.3919241,0.3142295,0.8330787,0.3438651,0.0594874,0.2525536,0.2981642,0.0667159,0.333921,0.0,-0.0893177,0.0,0.0,0.0,-0.0974299,-0.404855,-0.1982991,-0.0035619,-0.1564215,-2.205379],
    male_heart_failure: [0.5681541,-0.1048388,0.0,0.0,-0.4761564,0.30324,0.6840338,0.2656273,0.0833107,0.26999,0.2541805,0.0638923,0.2583631,0.0,-0.0391938,0.0,0.0,0.0,-0.1269124,-0.3273572,-0.2043019,-0.0182831,-0.1342618,-1.95751]},
  uacr_10yr: {terms: ['age', 'non_hdl_c', 'hdl_c', 'sbp_lt_110', 'sbp_gte_110', 'dm', 'smoking', 'bmi_lt_30', 'bmi_gte_30', 'egfr_lt_60', 'egfr_gte_60', 'bp_tx', 'statin', 'bp_tx_sbp_gte_110', 'statin_non_hdl_c', 'age_non_hdl_c', 'age_hdl_c', 'age_sbp_gte_110', 'age_dm', 'age_smoking', 'age_bmi_gte_30', 'age_egfr_lt_60', 'ln_uacr', 'missing_uacr', 'constant'],
    female_total_cvd: [0.7969249,0.0256635,-0.1588107,-0.2255701,0.3396649,0.8047515,0.5285338,0.0,0.0,0.4803511,0.0434472,0.2985207,-0.1497787,-0.0742889,0.106756,-0.0778126,0.0306768,-0.0907168,-0.2705122,-0.0830564,0.0,-0.1389249,0.1793037,0.0132073,-3.738341],
    male_total_cvd: [0.7768655,0.0659949,-0.0951111,-0.420667,0.3120151,0.698521,0.4314669,0.0,0.0,0.3841364,0.009384,0.2676494,-0.1390966,-0.0579315,0.1383719,-0.0488332,0.0200406,-0.102454,-0.2236355,-0.089485,0.0,-0.1321848,0.1887974,0.0916979,-3.510705],
    female_ascvd: [0.7201999,0.1135771,-0.1493506,-0.0726677,0.3436259,0.7773094,0.4746662,0.0,0.0,0.3824646,0.0394178,0.2125182,-0.0603046,-0.0466053,0.0733118,-0.0534262,0.0325689,-0.0999887,-0.2411762,-0.0826941,0.0,-0.1444737,0.1501217,0.0050257,-4.174614],
    male_ascvd: [0.7141718,0.1602194,-0.1139086,-0.2719456,0.3058719,0.6600631,0.3884022,0.0,0.0,0.2466316,0.0151852,0.186167,-0.0894395,-0.0411884,0.1058212,-0.028089,0.0240427,-0.0912325,-0.2004894,-0.096936,0.0,-0.1022867,0.1510073,0.0556,-3.85146],
    female_heart_failure: [0.9145975,0.0,0.0,-0.4441346,0.3260323,0.9611365,0.5755787,0.0008831,0.2988964,0.5915291,0.0556823,0.3314097,0.0,-0.1078596,0.0,0.0,0.0,-0.0875231,-0.356859,-0.1220248,-0.0053637,-0.1610389,0.2197281,0.0326667,-4.841506],
    male_heart_failure: [0.9111795,0.0,0.0,-0.6693649,0.3290082,0.8377655,0.4978917,-0.042749,0.3624165,0.5075796,0.0137716,0.2739963,0.0,-0.0645712,0.0,0.0,0.0,-0.1230039,-0.3013297,-0.1410318,0.0021531,-0.1548018,0.2306299,0.1472194,-4.556907]},
  uacr_30yr: {terms: ['age', 'age_squared', 'non_hdl_c', 'hdl_c', 'sbp_lt_110', 'sbp_gte_110', 'dm', 'smoking', 'bmi_lt_30', 'bmi_gte_30', 'egfr_lt_60', 'egfr_gte_60', 'bp_tx', 'statin', 'bp_tx_sbp_gte_110', 'statin_non_hdl_c', 'age_non_hdl_c', 'age_hdl_c', 'age_sbp_gte_110', 'age_dm', 'age_smoking', 'age_bmi_gte_30', 'age_egfr_lt_60', 'ln_uacr', 'missing_uacr', 'constant'],
    female_total_cvd: [0.5491768,-0.0937311,0.0359847,-0.1642965,-0.1483404,0.313353,0.6253766,0.3147172,0.0,0.0,0.1094663,0.0550705,0.2782433,-0.0786239,-0.0628947,0.093204,-0.0710685,0.0306363,-0.0951455,-0.3168231,-0.1636391,0.0,-0.1265483,0.1142251,-0.0055863,-1.583738],
    male_total_cvd: [0.464491,-0.0998895,0.0757606,-0.1031778,-0.1990714,0.2715816,0.4754637,0.2069672,0.0,0.0,0.0331103,0.0540474,0.2189911,-0.0331044,-0.04534,0.1214535,-0.0483995,0.0178997,-0.1059324,-0.2492861,-0.1561543,0.0,-0.1012429,0.1007571,0.0572456,-1.398727],
    female_ascvd: [0.4629669,-0.0902777,0.1215214,-0.1522069,0.0092679,0.3113609,0.581256,0.263167,0.0,0.0,0.0391726,0.0492959,0.1786178,0.0131058,-0.0325135,0.0617093,-0.0489189,0.0321079,-0.1003185,-0.2684574,-0.1547301,0.0,-0.1130703,0.0903471,-0.0145818,-2.178888],
    male_ascvd: [0.3995607,-0.094557,0.1686692,-0.1202145,-0.0555561,0.2633566,0.4362036,0.1716233,0.0,0.0,-0.0775282,0.0561236,0.1319331,0.0102428,-0.0269294,0.0920557,-0.0297021,0.0217935,-0.0893347,-0.2081467,-0.1542716,0.0,-0.0597254,0.0684872,0.0193962,-1.873449],
    female_heart_failure: [0.6319513,-0.1009284,0.0,0.0,-0.3787175,0.2863393,0.7631221,0.3355843,0.0677084,0.2517238,0.1940067,0.0664006,0.3171436,0.0,-0.0970661,0.0,0.0,0.0,-0.0896239,-0.400743,-0.2042041,-0.0054699,-0.13602,0.1486028,0.011608,-2.538952],
    male_heart_failure: [0.5750236,-0.1062268,0.0,0.0,-0.4633994,0.2742874,0.612208,0.2614987,0.0895459,0.2632424,0.1430472,0.0535184,0.2417468,0.0,-0.0498574,0.0,0.0,0.0,-0.1193827,-0.316651,-0.2046122,-0.0216878,-0.1165637,0.1366452,0.1078355,-2.314872]}
};
// x: { sex 'F'|'M', age, tc, hdl (mg/dL), sbp, bmi, egfr, dm, smoking, bpTx, statin, uacr (mg/g or null) } → risks as fractions
function preventRisk(x) {
  const mm = 0.02586, tc = x.tc * mm, hdl = x.hdl * mm;
  const age = (x.age - 55) / 10, nonHdl = tc - hdl - 3.5, hd = (hdl - 1.3) / 0.3;
  const sbpLt = (Math.min(x.sbp, 110) - 110) / 20, sbpGte = (Math.max(x.sbp, 110) - 130) / 20;
  const bmiLt = (Math.min(x.bmi, 30) - 25) / 5, bmiGte = (Math.max(x.bmi, 30) - 30) / 5;
  const egfrLt = (Math.min(x.egfr, 60) - 60) / -15, egfrGte = (Math.max(x.egfr, 60) - 90) / -15;
  const dm = x.dm ? 1 : 0, sm = x.smoking ? 1 : 0, bp = x.bpTx ? 1 : 0, st = x.statin ? 1 : 0;
  const u = x.uacr ? Math.min(Math.max(x.uacr, 0.1), 25000) : null;
  const t = { age, age_squared: age * age, non_hdl_c: nonHdl, hdl_c: hd, sbp_lt_110: sbpLt, sbp_gte_110: sbpGte, dm, smoking: sm,
    bmi_lt_30: bmiLt, bmi_gte_30: bmiGte, egfr_lt_60: egfrLt, egfr_gte_60: egfrGte, bp_tx: bp, statin: st,
    bp_tx_sbp_gte_110: bp * sbpGte, statin_non_hdl_c: st * nonHdl, age_non_hdl_c: age * nonHdl, age_hdl_c: age * hd,
    age_sbp_gte_110: age * sbpGte, age_dm: age * dm, age_smoking: age * sm, age_bmi_gte_30: age * bmiGte, age_egfr_lt_60: age * egfrLt,
    ln_uacr: u === null ? 0 : Math.log(u), missing_uacr: u === null ? 1 : 0, constant: 1 };
  const model = u === null ? 'base' : 'uacr', sex = x.sex === 'F' ? 'female' : 'male';
  const one = (yrs, out) => { const m = PREVENT_COEF[`${model}_${yrs}`], b = m[`${sex}_${out}`]; const lp = m.terms.reduce((s, n, i) => s + b[i] * t[n], 0); return Math.exp(lp) / (1 + Math.exp(lp)); };
  const set = yrs => ({ cvd: one(yrs, 'total_cvd'), ascvd: one(yrs, 'ascvd'), hf: one(yrs, 'heart_failure') });
  return { model, ten: set('10yr'), thirty: x.age <= 59 ? set('30yr') : null };
}
const pct = f => r1(f * 100) + '%';
const BP_MED_RE = /pril|sartan|amlodipine|nifedipine|felodipine|lercanidipine|diltiazem|verapamil|olol|thiazide|chlorthalidone|indapamide|spironolactone|eplerenone|hydralazine|clonidine|methyldopa|doxazosin|prazosin|terazosin|minoxidil|furosemide|torsemide|bumetanide|aliskiren/i;
const STATIN_RE = /(atorva|rosuva|simva|prava|pitava|fluva|lova)statin/i;
const CANCER_RE = /cancer|carcinoma|lymphoma|leuk|myeloma|metasta|sarcoma|melanoma|MDS|tumor|neoplasm/i;

const CALCS = [
  // ===================== Kidney =====================
  {
    id: 'egfr', name: 'eGFR (CKD-EPI 2021)', cat: 'Kidney', specs: ALL_SPECS,
    fields: [LAB('cr', 'Creatinine', 'mg/dL', 'Cr'), AGE, SEX,
      { k: 'dial', l: 'On dialysis', t: 'chk', pre: P => P.has('ESKD on HD', 'ESKD on PD', 'AKI – on dialysis (RRT)') }],
    calc: v => {
      if (v.dial) return { main: 'eGFR not meaningful on dialysis', level: 'warn', lines: ['Use dialysis adequacy and residual urine output instead'], text: 'On dialysis — eGFR not applicable' };
      if (![v.cr, v.age, v.sex].every(has) || v.cr <= 0) return null;
      const e = egfrCalc(v.cr, v.age, v.sex);
      return { main: `eGFR ${r0(e)} mL/min/1.73m²`, level: e < 30 ? 'high' : e < 60 ? 'warn' : 'ok',
        lines: [`CKD stage ${gStage(e)} if stable for more than 3 months`, 'Not valid in AKI (changing creatinine) or on dialysis'],
        text: `eGFR ${r0(e)} mL/min/1.73m² (CKD-EPI 2021, Cr ${v.cr})` };
    },
    ref: 'Inker LA et al. N Engl J Med 2021;385:1737–49'
  },
  {
    id: 'crcl', name: 'Creatinine clearance (Cockcroft–Gault)', cat: 'Kidney', specs: ['Nephrology', 'Cardiology', 'ICU', 'Hematology', 'Rheumatology', 'Endocrine', 'Oncology', 'Gastroenterology', 'Geriatrics', 'Infectious Diseases', 'Neurology'],
    fields: [LAB('cr', 'Creatinine', 'mg/dL', 'Cr'), AGE, WT, SEX],
    calc: v => {
      if (![v.cr, v.age, v.wt, v.sex].every(has) || v.cr <= 0) return null;
      const c = (140 - v.age) * v.wt / (72 * v.cr) * (v.sex === 'F' ? 0.85 : 1);
      return { main: `CrCl ${r0(c)} mL/min`, level: c < 30 ? 'high' : c < 60 ? 'warn' : 'ok',
        lines: ['Uses actual body weight — in obesity consider ideal or adjusted body weight', 'Used for many drug-dose adjustments (e.g. DOACs)'],
        text: `CrCl ${r0(c)} mL/min (Cockcroft–Gault, weight ${v.wt} kg)` };
    },
    ref: 'Cockcroft DW, Gault MH. Nephron 1976;16:31–41'
  },
  {
    id: 'aki', name: 'AKI stage (KDIGO)', cat: 'Kidney', specs: ['Nephrology', 'ICU', 'Cardiology', 'Gastroenterology', 'Oncology', 'Geriatrics', 'Infectious Diseases'],
    fields: [{ k: 'base', l: 'Baseline creatinine', u: 'mg/dL', pre: P => P.baseCr },
      { k: 'peak', l: 'Peak creatinine (this episode)', u: 'mg/dL', pre: P => P.labMax('Cr') },
      LAB('cr', 'Latest creatinine', 'mg/dL', 'Cr'),
      { k: 'rise', l: 'Rise of ≥0.3 mg/dL within 48 h', t: 'chk' },
      { k: 'uo', l: 'Urine output', t: 'sel', opts: [['0', 'Normal or not measured'], ['1', '<0.5 mL/kg/h for 6–12 h'], ['2', '<0.5 mL/kg/h for ≥12 h'], ['3', '<0.3 mL/kg/h for ≥24 h, or anuria ≥12 h']] },
      { k: 'rrt', l: 'Dialysis started for this AKI', t: 'chk' }],
    calc: v => {
      const top = Math.max(has(v.peak) ? v.peak : 0, has(v.cr) ? v.cr : 0);
      if (!top && !v.rise && !has(v.uo) && !v.rrt) return null;
      const lines = [];
      let crSt = 0, ratio = null;
      if (has(v.base) && v.base > 0 && top) {
        ratio = top / v.base;
        crSt = ratio >= 3 || (top >= 4 && top - v.base >= 0.3) ? 3 : ratio >= 2 ? 2 : ratio >= 1.5 ? 1 : 0;
        lines.push(`Peak creatinine ${top} = ${r1(ratio)}× baseline ${v.base}`);
      } else if (top) lines.push('Enter a baseline creatinine to stage by the ratio (if none is known, use the lowest value this admission)');
      if (v.rise && crSt < 1) { crSt = 1; lines.push('Rise of ≥0.3 mg/dL within 48 h: stage 1'); }
      const uoSt = has(v.uo) ? Number(v.uo) : 0;
      const st = Math.max(crSt, uoSt, v.rrt ? 3 : 0);
      if (uoSt) lines.push(`Urine output criterion: stage ${uoSt}`);
      if (v.rrt) lines.push('Dialysis started: stage 3');
      if (has(v.base) && v.base > 0 && has(v.cr) && has(v.peak) && v.cr < v.peak) lines.push(`Latest ${v.cr} = ${r1(v.cr / v.base)}× baseline — creatinine is falling`);
      if (st === 0 && ratio === null) return { main: 'Baseline creatinine needed', level: 'warn', lines, text: '' };
      if (st === 0) lines.push('Does not meet KDIGO AKI criteria');
      else lines.push(['', 'Stage 1: 1.5–1.9× baseline, rise ≥0.3 mg/dL in 48 h, or urine <0.5 mL/kg/h for 6–12 h',
        'Stage 2: 2.0–2.9× baseline, or urine <0.5 mL/kg/h for ≥12 h',
        'Stage 3: ≥3× baseline, creatinine ≥4.0 mg/dL, dialysis, or urine <0.3 mL/kg/h ≥24 h / anuria ≥12 h'][st]);
      return { main: st ? `KDIGO AKI stage ${st}` : 'No AKI by KDIGO criteria', level: st >= 2 ? 'high' : st === 1 ? 'warn' : 'ok', lines,
        text: st ? `AKI stage ${st} (KDIGO)${ratio !== null ? ` — peak Cr ${top}, ${r1(ratio)}× baseline ${v.base}` : ''}` : 'No AKI by KDIGO criteria' };
    },
    ref: 'KDIGO Clinical Practice Guideline for Acute Kidney Injury. Kidney Int Suppl 2012;2:1–138'
  },
  {
    id: 'upcr', name: 'Urine protein/creatinine ratio', cat: 'Kidney', specs: ['Nephrology', 'Rheumatology'],
    fields: [LAB('up', 'Urine protein', 'mg/dL', 'U-ProtQ'), LAB('uc', 'Urine creatinine', '', 'U-Cr'),
      { k: 'ucu', l: 'Urine creatinine unit', t: 'seg', opts: [['mg', 'mg/dL'], ['mmol', 'mmol/L']], def: 'mg' }],
    calc: v => {
      if (![v.up, v.uc].every(has) || v.uc <= 0) return null;
      const ucMg = v.ucu === 'mmol' ? v.uc * 11.312 : v.uc;
      const ratio = v.up / ucMg, mgg = ratio * 1000;
      const cat = mgg < 150 ? 'Normal to mildly increased (<150 mg/g)' : mgg <= 500 ? 'Moderately increased (150–500 mg/g)' : 'Severely increased (>500 mg/g)';
      const lines = [`${r0(mgg)} mg/g · ${r0(ratio * 113.12)} mg/mmol`, cat];
      if (mgg >= 3500) lines.push('Nephrotic-range proteinuria (≥3.5 g/g)');
      return { main: `uPCR ${r2(ratio)} g/g (≈ ${r1(ratio)} g/day)`, level: mgg >= 3500 ? 'high' : mgg > 150 ? 'warn' : 'ok', lines,
        text: `uPCR ${r2(ratio)} g/g (${r0(mgg)} mg/g)` };
    },
    ref: 'KDIGO 2012 CKD guideline, proteinuria categories'
  },
  {
    id: 'fena', name: 'FeNa (fractional excretion of sodium)', cat: 'Kidney', specs: ['Nephrology', 'ICU'],
    fields: [LAB('una', 'Urine sodium', 'mmol/L', 'U-Na'), LAB('pna', 'Serum sodium', 'mmol/L', 'Na'),
      LAB('ucr', 'Urine creatinine', 'mg/dL', 'U-Cr'), LAB('pcr', 'Serum creatinine', 'mg/dL', 'Cr')],
    calc: v => {
      if (![v.una, v.pna, v.ucr, v.pcr].every(has) || v.pna <= 0 || v.ucr <= 0) return null;
      const fe = v.una * v.pcr / (v.pna * v.ucr) * 100;
      const t = fe < 1 ? 'Suggests prerenal AKI' : fe > 2 ? 'Suggests intrinsic AKI (e.g. ATN)' : 'Indeterminate (1–2%)';
      return { main: `FeNa ${fe < 1 ? r2(fe) : r1(fe)}%`, level: 'warn',
        lines: [t, 'Unreliable on diuretics (use FeUrea), in CKD, contrast nephropathy or early obstruction'],
        text: `FeNa ${fe < 1 ? r2(fe) : r1(fe)}% — ${lc1(t)}` };
    },
    ref: 'Espinel CH. JAMA 1976;236:579–81'
  },
  {
    id: 'feurea', name: 'FeUrea (fractional excretion of urea)', cat: 'Kidney', specs: ['Nephrology', 'ICU'],
    fields: [LAB('uu', 'Urine urea', 'mg/dL', 'U-Urea'), LAB('pu', 'Serum urea', 'mg/dL', 'Urea'),
      LAB('ucr', 'Urine creatinine', 'mg/dL', 'U-Cr'), LAB('pcr', 'Serum creatinine', 'mg/dL', 'Cr')],
    calc: v => {
      if (![v.uu, v.pu, v.ucr, v.pcr].every(has) || v.pu <= 0 || v.ucr <= 0) return null;
      const fe = v.uu * v.pcr / (v.pu * v.ucr) * 100;
      const t = fe <= 35 ? 'Suggests prerenal AKI' : fe > 50 ? 'Suggests intrinsic AKI (e.g. ATN)' : 'Indeterminate (35–50%)';
      return { main: `FeUrea ${r0(fe)}%`, level: 'warn', lines: [t, 'Useful when the patient is on diuretics'], text: `FeUrea ${r0(fe)}% — ${lc1(t)}` };
    },
    ref: 'Carvounis CP et al. Kidney Int 2002;62:2223–9'
  },
  // ----- v0.8 nephrology calculators -----
  {
    id: 'ktv', name: 'Dialysis adequacy (URR, Kt/V)', cat: 'Kidney', specs: ['Nephrology'],
    fields: [{ k: 'pre', l: 'Pre-dialysis urea (or BUN)', u: '' }, { k: 'post', l: 'Post-dialysis urea (or BUN)', u: '' },
      { k: 't', l: 'Session length', u: 'hours', def: 4 }, { k: 'uf', l: 'Fluid removed (UF)', u: 'L' }, { k: 'w', l: 'Post-dialysis weight', u: 'kg', pre: P => P.weight },
      { k: 'acc', l: 'Vascular access', t: 'seg', opts: [['avf', 'Fistula or graft'], ['cvc', 'Catheter']], def: 'avf' }],
    calc: v => {
      if (![v.pre, v.post].every(has) || v.pre <= 0 || v.post < 0) return null;
      if (v.post >= v.pre) return { main: 'Post value must be lower than pre', level: 'warn', lines: ['Check the two urea values (same unit for both)'], text: '' };
      const R = v.post / v.pre, urr = (1 - R) * 100, lines = [];
      let sp = null, eq = null;
      if (has(v.t) && v.t > 0 && has(v.w) && v.w > 0 && R - 0.008 * v.t > 0) {
        sp = -Math.log(R - 0.008 * v.t) + (4 - 3.5 * R) * (has(v.uf) ? v.uf : 0) / v.w;
        eq = v.acc === 'cvc' ? sp - 0.47 * sp / v.t + 0.02 : sp - 0.6 * sp / v.t + 0.03;
      }
      lines.push(`URR ${r0(urr)}% — ${urr >= 65 ? 'meets' : 'below'} the minimum of 65% (aim for about 70%)`);
      if (sp !== null) {
        lines.push(`spKt/V ${r2(sp)} — ${sp >= 1.4 ? 'at target (1.4)' : sp >= 1.2 ? 'above the minimum (1.2) but below the target of 1.4' : 'below the minimum of 1.2'}`);
        lines.push(`eKt/V ${r2(eq)} (equilibrated, ${v.acc === 'cvc' ? 'catheter' : 'fistula or graft'})`);
        if (!has(v.uf)) lines.push('No UF entered: counted as 0 L, which slightly underestimates Kt/V');
      } else lines.push('Add session length and post-dialysis weight for Kt/V');
      lines.push('Any urea unit works if pre and post use the same one. Targets are for dialysis three times a week');
      lines.push('Post sample: slow the blood pump to 100 mL/min for 15 seconds before drawing, to avoid recirculation');
      const ok = urr >= 65 && (sp === null || sp >= 1.2);
      return { main: `URR ${r0(urr)}%${sp !== null ? ` · spKt/V ${r2(sp)}` : ''}`, level: ok ? 'ok' : 'warn', lines,
        text: `URR ${r0(urr)}%${sp !== null ? `, spKt/V ${r2(sp)}, eKt/V ${r2(eq)}` : ''} (${has(v.t) ? v.t + ' h' : ''}${has(v.uf) ? ', UF ' + v.uf + ' L' : ''})` };
    },
    ref: 'Daugirdas JT. J Am Soc Nephrol 1993;4:1205–13; Daugirdas JT, Schneditz D. ASAIO J 1995;41:M719–24; KDOQI Hemodialysis Adequacy 2015'
  },
  {
    id: 'ganzoni', name: 'Iron deficit (Ganzoni)', cat: 'Blood', specs: ['Nephrology', 'Hematology', 'Gastroenterology', 'Oncology', 'Geriatrics'],
    fields: [WT, LAB('hb', 'Hemoglobin', 'g/dL', 'Hb'), { k: 'target', l: 'Target Hb (blank = 15)', u: 'g/dL' }, { k: 'stores', l: 'Iron stores (blank = 500)', u: 'mg' }],
    calc: v => {
      if (![v.wt, v.hb].every(has) || v.wt <= 0 || v.hb <= 0) return null;
      const lines = [];
      let hb = v.hb;
      if (hb > 25) { hb = r1(hb / 10); lines.push(`Hb ${v.hb} read as g/L → ${hb} g/dL`); }
      const small = v.wt < 35;
      const target = has(v.target) ? (v.target > 25 ? v.target / 10 : v.target) : (small ? 13 : 15);
      const stores = has(v.stores) ? v.stores : (small ? r0(15 * v.wt) : 500);
      const total = Math.round((Math.max(0, v.wt * (target - hb) * 2.4) + stores) / 10) * 10;
      lines.unshift(`${v.wt} kg × (${target} − ${hb}) × 2.4 + ${stores} mg for stores`);
      const fcm = Math.min(1000, Math.floor(20 * v.wt / 50) * 50);
      lines.push(`Iron sucrose: about ${Math.ceil(total / 200)} doses of 200 mg`);
      lines.push(`Ferric carboxymaltose: ${Math.ceil(total / fcm)} infusion${Math.ceil(total / fcm) > 1 ? 's' : ''} of up to ${fcm} mg (max 20 mg/kg and 1000 mg per infusion, once a week) — check your product's label`);
      lines.push('Check ferritin and TSAT first. In CKD and dialysis, iron is usually given in courses guided by ferritin and TSAT rather than by this formula');
      return { main: `Total iron deficit ≈ ${total} mg`, level: 'warn', lines, text: `Ganzoni iron deficit ≈ ${total} mg (Hb ${hb} → ${target} g/dL, ${v.wt} kg)` };
    },
    ref: 'Ganzoni AM. Schweiz Med Wochenschr 1970;100:301–3'
  },
  {
    id: 'admad', name: 'Sodium change per litre of fluid (Adrogué–Madias)', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU', 'Endocrine', 'Neurology', 'Geriatrics'],
    fields: [LAB('na', 'Serum Na', 'mmol/L', 'Na'), WT, AGE, { k: 'addk', l: 'KCl added per litre', u: 'mmol' }, { k: 'goal', l: 'Planned Na change in 24 h', u: 'mmol/L' }, SEX,
      { k: 'fluid', l: 'Fluid', t: 'sel', opts: [['513|0|3% NaCl', '3% NaCl (Na 513)'], ['154|0|0.9% NaCl', '0.9% NaCl (Na 154)'], ['140|5|Plasma-Lyte', 'Plasma-Lyte 148 (Na 140, K 5)'], ['130|4|Ringer\'s lactate', 'Ringer\'s lactate (Na 130, K 4)'], ['77|0|0.45% NaCl', '0.45% NaCl (Na 77)'], ['77|0|D5 0.45% NaCl', '5% dextrose in 0.45% NaCl (Na 77)'], ['0|0|5% dextrose', '5% dextrose in water (Na 0)']] },
      { k: 'risk', l: 'High risk of osmotic demyelination (Na ≤105, alcohol use, malnutrition, liver disease or low K)', t: 'chk' }],
    calc: v => {
      if (![v.na, v.wt, v.age, v.sex].every(has) || !v.fluid) return null;
      const [fna, fk, fname] = v.fluid.split('|');
      const k = Number(fk) + (has(v.addk) ? v.addk : 0);
      const f = v.sex === 'M' ? (v.age >= 65 ? 0.5 : 0.6) : (v.age >= 65 ? 0.45 : 0.5);
      const tbw = v.wt * f, d = (Number(fna) + k - v.na) / (tbw + 1);
      const sd = (d > 0 ? '+' : '') + r1(d);
      const lines = [`Total body water ${r0(tbw)} L (${f} × weight) · ${fname}${k ? ` with K ${r0(k)} mmol/L` : ''}`];
      const hypo = v.na < 135, hyper = v.na > 145, limit = hypo && v.risk ? 8 : 10;
      let level = 'warn';
      if (hypo && d <= 0) { lines.push('⚠ This fluid will not raise the sodium — it will lower it. Choose a fluid with more sodium than the serum'); level = 'high'; }
      if (hyper && d >= 0) { lines.push('⚠ This fluid will not lower the sodium. Choose a fluid with less sodium than the serum'); level = 'high'; }
      const wrongWay = (hypo && d <= 0) || (hyper && d >= 0);
      if (Math.abs(d) > 0.01 && !wrongWay) {
        const g = has(v.goal) && v.goal > 0 ? v.goal : limit, vol = g / Math.abs(d);
        lines.push(`For a ${g} mmol/L change: about ${vol >= 1 ? r1(vol) + ' L' : r0(vol * 1000) + ' mL'} (${r0(vol * 1000 / 24)} mL/h over 24 h)`);
        if (has(v.goal) && v.goal > limit && (hypo || hyper)) { lines.push(`⚠ ${v.goal} mmol/L in 24 h is more than the limit of ${limit}`); level = 'high'; }
      }
      if (hypo) lines.push(`Chronic hyponatremia: raise Na by no more than ${limit} mmol/L in 24 h${v.risk ? ' (high risk)' : ''}. Severe symptoms: 3% NaCl 100–150 mL over 10–20 min, up to 3 times, aiming for a 4–6 mmol/L rise`);
      if (hyper) lines.push('Chronic hypernatremia: lower Na by no more than 10 mmol/L in 24 h');
      lines.push('The formula ignores urine and other ongoing losses — check Na every 2–4 h at first, more often if urine output rises');
      return { main: `Na change ≈ ${sd} mmol/L per litre`, level, lines, text: `Adrogué–Madias: 1 L ${fname} changes Na by ≈ ${sd} mmol/L (Na ${v.na}, TBW ${r0(tbw)} L)` };
    },
    ref: 'Adrogué HJ, Madias NE. N Engl J Med 2000;342:1581–9 and 1493–9; Verbalis JG et al. Am J Med 2013;126:S1–42; Spasovski G et al. Eur J Endocrinol 2014;170:G1–47'
  },
  {
    id: 'krep', name: 'Potassium replacement (hypokalemia)', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU', 'Cardiology', 'Endocrine', 'Gastroenterology', 'Geriatrics', 'Oncology'],
    fields: [LAB('k', 'Serum K', 'mmol/L', 'K'), LAB('mg', 'Magnesium', 'mg/dL', 'Mg'),
      { k: 'ecg', l: 'ECG changes, arrhythmia or muscle weakness', t: 'chk' },
      { k: 'npo', l: 'Cannot take tablets by mouth', t: 'chk' },
      { k: 'ckd', l: 'eGFR <30, oliguria or on potassium-sparing drugs', t: 'chk', pre: P => { const c = P.lab('Cr'); if (!c || !P.age || !P.sex) return null; const e = egfrCalc(c.v, P.age, P.sex); return e < 30 ? { v: true, src: `eGFR ${r0(e)}` } : null; } },
      { k: 'shift', l: 'Low K from a shift into cells (insulin, salbutamol, alkalosis, periodic paralysis)', t: 'chk' }],
    calc: v => {
      if (!has(v.k)) return null;
      if (v.k >= 3.5) return { main: 'K is not low', level: 'ok', lines: ['Replacement is for K below 3.5 mmol/L'], text: `K ${v.k} — no replacement needed` };
      const lo = Math.round((4 - v.k) * 300 / 10) * 10, hi = Math.round((4 - v.k) * 400 / 10) * 10;
      const sev = v.k < 2.5 || v.ecg ? 'Severe' : v.k < 3 ? 'Moderate' : 'Mild';
      const lines = [];
      if (v.shift) lines.push('⚠ Shift into cells: the true deficit is much smaller. Give cautiously and recheck often — K can rebound high');
      if (sev === 'Severe' || v.npo) {
        lines.push('IV KCl: up to 10 mmol/h through a peripheral line; up to 20 mmol/h only through a central line with cardiac monitoring');
        if (!v.npo) lines.push('Add oral KCl as soon as the patient can take it');
      } else if (sev === 'Moderate') lines.push('Oral KCl 40 mmol two or three times a day (IV if not tolerated)');
      else lines.push('Oral KCl 40–80 mmol a day in two or three doses');
      lines.push('Rule of thumb: 10 mmol of KCl raises serum K by about 0.1 mmol/L');
      if (v.ckd) lines.push('⚠ Low kidney function or K-sparing drugs: use about half the dose and recheck K within 2–4 h');
      if (has(v.mg) && v.mg < 1.7) lines.push(`Mg ${v.mg} mg/dL is low: replace magnesium too — low K will not correct until Mg is replaced`);
      else if (!has(v.mg)) lines.push('Check magnesium — low Mg keeps K low');
      lines.push('Dilute IV KCl in saline, not dextrose. Recheck K 2–4 h after IV doses, and the next day after oral doses');
      return { main: `${sev} hypokalemia — deficit roughly ${lo}–${hi} mmol`, level: sev === 'Severe' ? 'high' : 'warn', lines,
        text: `K ${v.k}: ${sev.toLowerCase()} hypokalemia, deficit ≈ ${lo}–${hi} mmol${v.ckd ? ' (low kidney function: half doses)' : ''}` };
    },
    ref: 'Gennari FJ. N Engl J Med 1998;339:451–8; Sterns RH et al. Medicine 1981;60:339–54'
  },
  {
    id: 'uag', name: 'Urine anion gap and osmolal gap', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU'],
    fields: [LAB('una', 'Urine Na', 'mmol/L', 'U-Na'), LAB('uk', 'Urine K', 'mmol/L', 'U-K'), LAB('ucl', 'Urine Cl', 'mmol/L', 'U-Cl'), LAB('uph', 'Urine pH', '', 'U-pH'),
      LAB('uosm', 'Urine osmolality', 'mOsm/kg', 'U-Osm'), LAB('uurea', 'Urine urea', 'mg/dL', 'U-Urea'), { k: 'uglu', l: 'Urine glucose', u: 'mg/dL' }, LAB('hco3', 'Serum HCO3', 'mmol/L', 'HCO3')],
    calc: v => {
      const lines = [];
      let main = '', text = '', level = 'warn';
      if ([v.una, v.uk, v.ucl].every(has)) {
        const uag = v.una + v.uk - v.ucl;
        main = `Urine anion gap ${uag > 0 ? '+' : ''}${r0(uag)} mmol/L`;
        lines.push(uag < 0 ? 'Negative: ammonium excretion is high — fits GI bicarbonate loss (e.g. diarrhea) or proximal (type 2) RTA'
          : 'Positive: ammonium excretion is low — fits distal (type 1) RTA, type 4 RTA or CKD');
        const warn = [];
        if (v.una < 20) warn.push('urine Na <20 mmol/L');
        if (has(v.uph) && v.uph > 6.5) warn.push('urine pH >6.5');
        if (warn.length) lines.push(`⚠ Unreliable here (${warn.join(', ')}) — use the osmolal gap instead`);
        lines.push('Also unreliable with ketones, toluene or drugs excreted as anions (e.g. penicillins)');
        text = `UAG ${uag > 0 ? '+' : ''}${r0(uag)} mmol/L`;
      }
      if ([v.uosm, v.una, v.uk, v.uurea].every(has)) {
        const calc = 2 * (v.una + v.uk) + v.uurea / 6.006 + (has(v.uglu) ? v.uglu / 18 : 0), uog = v.uosm - calc;
        lines.push(`Urine osmolal gap ${r0(uog)} mOsm/kg (estimated urine NH4 ≈ ${r0(Math.max(0, uog) / 2)} mmol/L)`);
        lines.push(uog >= 150 ? 'In metabolic acidosis, ≥150 means appropriate ammonium excretion (non-renal cause or proximal RTA)'
          : 'In metabolic acidosis, <150 means inadequate ammonium excretion (distal or type 4 RTA, CKD)');
        if (!main) main = `Urine osmolal gap ${r0(uog)} mOsm/kg`;
        text += `${text ? '; ' : ''}UOG ${r0(uog)} mOsm/kg`;
      }
      if (!main) return null;
      if (has(v.hco3) && v.hco3 >= 22) { lines.push(`Serum HCO3 ${v.hco3}: these gaps are meant for normal anion gap metabolic acidosis (low HCO3)`); level = 'ok'; }
      return { main, level, lines, text };
    },
    ref: 'Batlle DC et al. N Engl J Med 1988;318:594–9; Kim GH et al. Am J Kidney Dis 1996;27:42–7'
  },
  // ===================== Acid–base & fluids =====================
  {
    id: 'abg', name: 'ABG interpreter', cat: 'Acid–base & fluids', specs: ['ICU', 'Pulmonary', 'Nephrology', 'Endocrine'],
    fields: [LAB('ph', 'pH', '', 'pH'), LAB('pco2', 'pCO2', 'mmHg', 'pCO2'),
      { k: 'hco3', l: 'HCO3', u: 'mmol/L', pre: P => P.lab('aHCO3') || P.lab('HCO3') },
      LAB('na', 'Na (optional)', 'mmol/L', 'Na'), LAB('cl', 'Cl (optional)', 'mmol/L', 'Cl'), LAB('alb', 'Albumin (optional)', 'g/dL', 'Alb'),
      LAB('po2', 'pO2 (optional)', 'mmHg', 'pO2'), LAB('fio2', 'FiO2 (optional)', '%', 'FiO2'), AGE],
    calc: interpretABG,
    ref: "Winter's formula; Berend K et al. N Engl J Med 2014;371:1434–45"
  },
  {
    id: 'ag', name: 'Anion gap (albumin-corrected)', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU', 'Endocrine', 'Pulmonary'],
    fields: [LAB('na', 'Na', 'mmol/L', 'Na'), LAB('cl', 'Cl', 'mmol/L', 'Cl'), LAB('hco3', 'HCO3', 'mmol/L', 'HCO3'), LAB('alb', 'Albumin (optional)', 'g/dL', 'Alb')],
    calc: v => {
      const g = anionGap(v);
      if (!g) return null;
      const high = g.use > 12;
      return { main: `Anion gap ${r0(g.ag)}${g.agc !== null ? ` · corrected ${r1(g.agc)}` : ''} mmol/L`, level: high ? 'warn' : 'ok',
        lines: [high ? 'High anion gap: think lactate, ketones, kidney failure, toxins (methanol, ethylene glycol, salicylate)' : 'Anion gap not raised',
          'Typical normal about 8–12 mmol/L (check your lab); each 1 g/dL fall in albumin lowers the gap by about 2.5'],
        text: `AG ${r0(g.ag)}${g.agc !== null ? ` (albumin-corrected ${r1(g.agc)})` : ''}` };
    },
    ref: 'Figge J et al. Crit Care Med 1998;26:1807–10'
  },
  {
    id: 'delta', name: 'Delta–delta (delta ratio)', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU', 'Endocrine', 'Pulmonary'],
    fields: [LAB('na', 'Na', 'mmol/L', 'Na'), LAB('cl', 'Cl', 'mmol/L', 'Cl'), LAB('hco3', 'HCO3', 'mmol/L', 'HCO3'), LAB('alb', 'Albumin (optional)', 'g/dL', 'Alb')],
    calc: v => {
      const g = anionGap(v);
      if (!g) return null;
      if (g.use <= 12) return { main: 'Anion gap not raised', level: 'ok', lines: ['The delta ratio applies to a high anion gap acidosis'], text: `AG ${r1(g.use)} — not raised` };
      const da = deltaAnalysis(g, v.hco3);
      if (da.ratio === null) return da.alk
        ? { main: 'High anion gap acidosis + metabolic alkalosis', level: 'high', lines: da.lines, text: `AG ${r1(g.use)} with HCO3 ${v.hco3}: high anion gap acidosis + metabolic alkalosis` }
        : { main: 'Anion gap slightly raised, HCO3 normal', level: 'warn', lines: da.lines, text: `AG ${r1(g.use)} with HCO3 ${v.hco3}` };
      return { main: `Delta ratio ${r2(da.ratio)}`, level: da.alk ? 'high' : 'warn', lines: [...da.lines, deltaText(da.ratio).replace(/^./, c => c.toUpperCase())],
        text: `Delta ratio ${r2(da.ratio)} — ${deltaText(da.ratio)}` };
    },
    ref: 'Rastegar A. J Am Soc Nephrol 2007;18:2429–31'
  },
  {
    id: 'fwd', name: 'Free water deficit (hypernatremia)', cat: 'Acid–base & fluids', specs: ['Nephrology', 'ICU', 'Endocrine'],
    fields: [LAB('na', 'Na', 'mmol/L', 'Na'), WT, AGE, SEX],
    calc: v => {
      if (![v.na, v.wt, v.age, v.sex].every(has)) return null;
      if (v.na <= 145) return { main: 'Na not raised', level: 'ok', lines: ['Free water deficit applies when Na >145 mmol/L'], text: `Na ${v.na} — no free water deficit` };
      const f = v.sex === 'M' ? (v.age >= 65 ? 0.5 : 0.6) : (v.age >= 65 ? 0.45 : 0.5);
      const tbw = v.wt * f, d = tbw * (v.na / 140 - 1);
      return { main: `Free water deficit ≈ ${r1(d)} L`, level: 'warn',
        lines: [`Total body water ${r0(tbw)} L (${f} × weight)`, 'Lower Na by no more than about 10 mmol/L per 24 h in chronic hypernatremia; add ongoing losses'],
        text: `Free water deficit ≈ ${r1(d)} L (Na ${v.na})` };
    },
    ref: 'Adrogué HJ, Madias NE. N Engl J Med 2000;342:1493–9'
  },
  {
    id: 'cca', name: 'Corrected calcium (albumin)', cat: 'Endocrine & metabolic', specs: ['Nephrology', 'Endocrine', 'Hematology', 'Oncology'],
    fields: [LAB('ca', 'Calcium (total)', 'mg/dL', 'Ca'), LAB('alb', 'Albumin', 'g/dL', 'Alb')],
    calc: v => {
      if (![v.ca, v.alb].every(has)) return null;
      const c = v.ca + 0.8 * (4 - v.alb);
      return { main: `Corrected Ca ${r1(c)} mg/dL`, level: c > 10.5 || c < 8.5 ? 'warn' : 'ok',
        lines: [c > 10.5 ? 'High' : c < 8.5 ? 'Low' : 'Within 8.5–10.5 mg/dL', 'Ionized calcium is more reliable in CKD or very low albumin'],
        text: `Corrected Ca ${r1(c)} mg/dL (Ca ${v.ca}, albumin ${v.alb})` };
    },
    ref: 'Payne RB et al. BMJ 1973;4:643–6'
  },
  {
    id: 'cna', name: 'Corrected sodium (hyperglycemia)', cat: 'Endocrine & metabolic', specs: ['Endocrine', 'Nephrology', 'ICU'],
    fields: [LAB('na', 'Na', 'mmol/L', 'Na'), LAB('glu', 'Glucose', 'mg/dL', 'Glu')],
    calc: v => {
      if (![v.na, v.glu].every(has)) return null;
      if (v.glu <= 100) return { main: `Na ${v.na} (no correction needed)`, level: 'ok', lines: ['Glucose not raised'], text: `Na ${v.na}, glucose ${v.glu}` };
      const k = v.na + 1.6 * (v.glu - 100) / 100, h = v.na + 2.4 * (v.glu - 100) / 100;
      return { main: `Corrected Na ${r0(k)} (Katz) · ${r0(h)} (Hillier)`, level: (h > 145 || k < 135) ? 'warn' : 'ok',
        lines: ['Katz adds 1.6 and Hillier 2.4 mmol/L per 100 mg/dL of glucose above 100'],
        text: `Corrected Na ${r0(k)}–${r0(h)} (Na ${v.na}, glucose ${v.glu})` };
    },
    ref: 'Katz MA. N Engl J Med 1973;289:843–4; Hillier TA et al. Am J Med 1999;106:399–403'
  },
  {
    id: 'osm', name: 'Serum osmolality & osmolar gap', cat: 'Endocrine & metabolic', specs: ['Endocrine', 'Nephrology', 'ICU'],
    fields: [LAB('na', 'Na', 'mmol/L', 'Na'), LAB('glu', 'Glucose', 'mg/dL', 'Glu'), LAB('urea', 'Urea', 'mg/dL', 'Urea'), LAB('osm', 'Measured osmolality (optional)', 'mOsm/kg', 'Osm')],
    calc: v => {
      if (![v.na, v.glu, v.urea].every(has)) return null;
      const c = 2 * v.na + v.glu / 18 + v.urea / 6.006, eff = 2 * v.na + v.glu / 18;
      const lines = [`Effective (tonicity) ${r0(eff)} mOsm/kg${eff > 320 ? ' → >320 fits a hyperosmolar state (HHS)' : ''}`, 'Uses urea in mg/dL (if you have BUN, BUN/2.8 replaces urea/6)'];
      let level = eff > 320 ? 'high' : (c > 295 || c < 275) ? 'warn' : 'ok';
      if (has(v.osm)) {
        const gap = v.osm - c;
        lines.unshift(`Osmolar gap ${r0(gap)}${gap > 10 ? ' → raised: unmeasured osmoles (toxic alcohols, mannitol, ketones)' : ''}`);
        if (gap > 10) level = 'high';
      }
      return { main: `Calculated osmolality ${r0(c)} mOsm/kg`, level, lines, text: `Calculated osmolality ${r0(c)}, effective ${r0(eff)}${has(v.osm) ? `, osmolar gap ${r0(v.osm - c)}` : ''}` };
    },
    ref: 'Calculated osmolality = 2Na + glucose/18 + urea/6'
  },
  // ===================== Heart =====================
  {
    id: 'chads', name: 'CHA₂DS₂-VASc / CHA₂DS₂-VA', cat: 'Heart', specs: ['Cardiology', 'ICU', 'Geriatrics', 'Neurology'],
    fields: [
      { k: 'chf', l: 'Heart failure or LV dysfunction', t: 'chk', pts: 1, pre: P => P.has('HF', /^Heart failure/, /Cardiomyopathy/) },
      { k: 'htn', l: 'Hypertension', t: 'chk', pts: 1, pre: P => P.has('HTN', /^Hypertension/) },
      AGE,
      { k: 'dm', l: 'Diabetes', t: 'chk', pts: 1, pre: P => P.has('DM1', 'DM2', /^Diabetes/, /^Diabetic/) },
      { k: 'stroke', l: 'Previous stroke, TIA or thromboembolism', t: 'chk', pts: 2, pre: P => P.has('Previous stroke', 'Previous VTE', /^Stroke/) },
      { k: 'vasc', l: 'Vascular disease (MI, PAD, aortic plaque)', t: 'chk', pts: 1, pre: P => P.has('IHD', 'PAD', 'Previous PCI', 'Previous CABG', 'STEMI', 'NSTEMI') },
      SEX],
    calc: v => {
      if (!has(v.age) || !v.sex) return null;
      const agePts = v.age >= 75 ? 2 : v.age >= 65 ? 1 : 0;
      const va = (v.chf ? 1 : 0) + (v.htn ? 1 : 0) + agePts + (v.dm ? 1 : 0) + (v.stroke ? 2 : 0) + (v.vasc ? 1 : 0);
      const vasc = va + (v.sex === 'F' ? 1 : 0);
      const rec = va >= 2 ? 'Oral anticoagulation recommended' : va === 1 ? 'Oral anticoagulation should be considered' : 'Score alone does not indicate anticoagulation';
      return { main: `CHA₂DS₂-VASc ${vasc} · CHA₂DS₂-VA ${va}`, level: va >= 2 ? 'high' : va === 1 ? 'warn' : 'ok',
        lines: [`${rec} (ESC 2024, using CHA₂DS₂-VA)`, 'Anticoagulate regardless of score in hypertrophic cardiomyopathy or cardiac amyloidosis; mechanical valve or moderate–severe mitral stenosis needs warfarin'],
        text: `CHA₂DS₂-VASc ${vasc} (VA ${va}) — ${rec.toLowerCase()}` };
    },
    ref: 'Lip GYH et al. Chest 2010;137:263–72; 2024 ESC AF guidelines'
  },
  {
    id: 'hasbled', name: 'HAS-BLED bleeding risk', cat: 'Heart', specs: ['Cardiology', 'ICU', 'Geriatrics', 'Neurology'],
    fields: [
      { k: 'h', l: 'Uncontrolled hypertension (SBP >160)', t: 'chk', pts: 1, pre: P => { const s = P.vit('sbp'); return s && s.v > 160 ? { v: true, src: s.src } : false; } },
      { k: 'ren', l: 'Abnormal kidney function (dialysis, transplant or Cr >2.26 mg/dL)', t: 'chk', pts: 1, pre: P => { const c = P.lab('Cr'); return P.has('ESKD on HD', 'ESKD on PD', 'Kidney transplant') || (c && c.v > 2.26) ? true : false; } },
      { k: 'liv', l: 'Abnormal liver function (cirrhosis, or bilirubin >2× and enzymes >3× normal)', t: 'chk', pts: 1, pre: P => P.has('Chronic liver disease') },
      { k: 's', l: 'Previous stroke', t: 'chk', pts: 1, pre: P => P.has('Previous stroke', /^Stroke/) },
      { k: 'b', l: 'Previous major bleeding or bleeding tendency', t: 'chk', pts: 1, pre: P => P.has(/GI bleeding/, 'Bleeding on anticoagulant') },
      { k: 'l', l: 'Labile INR (if on warfarin)', t: 'chk', pts: 1 },
      { k: 'e', l: 'Age over 65', t: 'chk', pts: 1, pre: P => has(P.age) ? P.age > 65 : null },
      { k: 'd', l: 'Antiplatelet or NSAID use', t: 'chk', pts: 1, pre: P => P.medHas(/aspirin|clopidogrel|ticagrelor|prasugrel|ibuprofen|diclofenac|naproxen|ketorolac|celecoxib/i) },
      { k: 'a', l: 'Alcohol ≥8 drinks per week', t: 'chk', pts: 1 }],
    calc: v => {
      const s = ['h', 'ren', 'liv', 's', 'b', 'l', 'e', 'd', 'a'].reduce((t, k) => t + (v[k] ? 1 : 0), 0);
      return { main: `HAS-BLED ${s}`, level: s >= 3 ? 'high' : 'ok',
        lines: [s >= 3 ? 'High bleeding risk: correct modifiable factors and review more often — not a reason by itself to withhold anticoagulation' : 'Lower bleeding risk', 'Modifiable: blood pressure, antiplatelets/NSAIDs, alcohol, labile INR'],
        text: `HAS-BLED ${s}${s >= 3 ? ' (high bleeding risk)' : ''}` };
    },
    ref: 'Pisters R et al. Chest 2010;138:1093–100'
  },
  {
    id: 'qtc', name: 'QTc (Bazett & Fridericia)', cat: 'Heart', specs: ['Cardiology', 'ICU'],
    fields: [{ k: 'qt', l: 'QT interval', u: 'ms' }, { k: 'hr', l: 'Heart rate', u: 'bpm', pre: P => P.vit('hr') }, SEX],
    calc: v => {
      if (![v.qt, v.hr].every(has) || v.hr <= 0) return null;
      const rr = 60 / v.hr, b = v.qt / Math.sqrt(rr), f = v.qt / Math.cbrt(rr);
      const use = (v.hr > 100 || v.hr < 60) ? f : b;
      const lim = v.sex === 'F' ? 460 : 450;
      const t = use >= 500 ? 'Markedly prolonged (≥500 ms): high risk of torsades — review QT-prolonging drugs, K and Mg' : use > lim ? `Prolonged (>${lim} ms)` : 'Normal';
      return { main: `QTc ${r0(b)} ms (Bazett) · ${r0(f)} ms (Fridericia)`, level: use >= 500 ? 'high' : use > lim ? 'warn' : 'ok',
        lines: [t, 'Fridericia is more accurate when the heart rate is below 60 or above 100'],
        text: `QTc ${r0(b)} ms Bazett / ${r0(f)} ms Fridericia — ${t.split(':')[0].toLowerCase()}` };
    },
    ref: 'Rautaharju PM et al. Circulation 2009;119:e241–50 (AHA/ACCF/HRS)'
  },
  {
    id: 'prevent', name: 'PREVENT CVD risk (AHA)', cat: 'Heart', specs: ['Cardiology', 'Nephrology', 'Endocrine', 'Rheumatology', 'Geriatrics'],
    fields: [AGE, SEX, LAB('tc', 'Total cholesterol', 'mg/dL', 'TC'), LAB('hdl', 'HDL cholesterol', 'mg/dL', 'HDL'),
      { k: 'sbp', l: 'Systolic BP', u: 'mmHg', pre: P => P.vit('sbp') }, WT, HT, LAB('cr', 'Creatinine (for eGFR)', 'mg/dL', 'Cr'),
      { k: 'dm', l: 'Diabetes', t: 'chk', pre: P => P.has('DM1', 'DM2', /^Diabetes(?! – gestational)/) },
      { k: 'smk', l: 'Current smoker (cigarettes or shisha)', t: 'chk', pre: P => P.has('Smoker') },
      { k: 'bptx', l: 'On blood pressure medicine', t: 'chk', pre: P => P.medHas(BP_MED_RE) },
      { k: 'statin', l: 'On a statin', t: 'chk', pre: P => P.medHas(STATIN_RE) },
      LAB('uacr', 'Urine albumin/creatinine (optional)', 'mg/g', 'uACR'), LAB('ldl', 'LDL (optional)', 'mg/dL', 'LDL'),
      { k: 'cvd', l: 'Known ASCVD or heart failure', t: 'chk', pre: P => P.has('IHD', 'HF', 'Previous stroke', 'PAD', 'Previous PCI', 'Previous CABG', 'STEMI', 'NSTEMI', 'Peripheral arterial disease', /^Heart failure/, /^Stroke/) }],
    calc: v => {
      if (v.cvd) return { main: 'PREVENT is for primary prevention only', level: 'warn', lines: ['Known ASCVD or heart failure: treat as secondary prevention (high-intensity statin, BP target <130/80)'], text: '' };
      const need = [['age', 'age'], ['sex', 'sex'], ['tc', 'total cholesterol'], ['hdl', 'HDL'], ['sbp', 'systolic BP'], ['wt', 'weight'], ['ht', 'height'], ['cr', 'creatinine']];
      const miss = need.filter(([k]) => !has(v[k])).map(([, l]) => l);
      if (miss.length) return miss.length === need.length ? null : { main: 'Needs ' + miss.join(', '), level: 'warn', lines: [], text: '' };
      const bmi = v.wt / Math.pow(v.ht / 100, 2), egfr = egfrCalc(v.cr, v.age, v.sex);
      const out = [];
      if (v.age < 30 || v.age > 79) out.push(`age ${v.age} (valid 30–79)`);
      if (v.tc < 130 || v.tc > 320) out.push(`total cholesterol ${v.tc} (valid 130–320 mg/dL)`);
      if (v.hdl < 20 || v.hdl > 100) out.push(`HDL ${v.hdl} (valid 20–100 mg/dL)`);
      if (v.sbp < 90 || v.sbp > 180) out.push(`SBP ${v.sbp} (valid 90–180)`);
      if (bmi < 18.5 || bmi >= 40) out.push(`BMI ${r1(bmi)} (valid 18.5–39.9)`);
      if (egfr < 15 || egfr > 140) out.push(`eGFR ${r0(egfr)} (valid 15–140)`);
      if (out.length) return { main: 'Outside the range PREVENT was built on', level: 'warn', lines: out.map(x => '• ' + x), text: '' };
      const R = preventRisk({ sex: v.sex, age: v.age, tc: v.tc, hdl: v.hdl, sbp: v.sbp, bmi, egfr, dm: v.dm, smoking: v.smk, bpTx: v.bptx, statin: v.statin, uacr: has(v.uacr) && v.uacr > 0 ? v.uacr : null });
      const a = R.ten.ascvd, c = R.ten.cvd, lines = [];
      lines.push(`10-year: total CVD ${pct(c)} · ASCVD ${pct(a)} · heart failure ${pct(R.ten.hf)}`);
      if (R.thirty) lines.push(`30-year: total CVD ${pct(R.thirty.cvd)} · ASCVD ${pct(R.thirty.ascvd)} · heart failure ${pct(R.thirty.hf)}`);
      const cat = a < 0.03 ? 'low' : a < 0.05 ? 'borderline' : a < 0.10 ? 'intermediate' : 'high';
      if (has(v.ldl) && v.ldl >= 190) lines.push('LDL ≥190 mg/dL: maximally tolerated statin regardless of the risk estimate');
      else {
        const lip = { low: 'Low (<3%): healthy lifestyle; a statin is reasonable if LDL 160–189 mg/dL' + (R.thirty ? ` or 30-year ASCVD ≥10% (now ${pct(R.thirty.ascvd)})` : ''),
          borderline: 'Borderline (3–<5%): a statin is reasonable after discussion; risk enhancers or a CAC score can help decide',
          intermediate: 'Intermediate (5–<10%): start at least a moderate-intensity statin; LDL goal <100 mg/dL',
          high: 'High (≥10%): high-intensity statin; LDL goal <70 mg/dL' }[cat];
        lines.push('Lipids — ASCVD risk ' + lip + (v.statin ? ' (already on a statin)' : ''));
      }
      const ckd = egfr < 60 || (has(v.uacr) && v.uacr >= 30);
      if (v.sbp >= 140) lines.push('BP — stage 2 hypertension: medication recommended; target <130/80');
      else if (v.sbp >= 130) {
        if (v.bptx) lines.push('BP — above the <130/80 target: adjust treatment');
        else if (c >= 0.075 || v.dm || ckd) lines.push(`BP — stage 1 hypertension with ${c >= 0.075 ? '10-year CVD risk ≥7.5%' : v.dm ? 'diabetes' : 'CKD'}: start medication`);
        else lines.push('BP — stage 1 hypertension with 10-year CVD risk <7.5%: lifestyle for 3–6 months, then medication if BP stays ≥130/80');
      }
      lines.push(`BMI ${r1(bmi)} · eGFR ${r0(egfr)} · ${R.model === 'uacr' ? 'model with UACR' : 'base model'}`);
      return { main: `10-yr CVD ${pct(c)} · ASCVD ${pct(a)}`, level: a >= 0.10 || c >= 0.20 ? 'high' : a >= 0.03 || c >= 0.075 ? 'warn' : 'ok', lines,
        text: `PREVENT 10-yr CVD ${pct(c)}, ASCVD ${pct(a)}, HF ${pct(R.ten.hf)}${R.thirty ? `; 30-yr CVD ${pct(R.thirty.cvd)}` : ''} — ${cat} ASCVD risk` };
    },
    ref: 'Khan SS et al. Circulation 2024;149:430–49 (PREVENT); 2026 ACC/AHA dyslipidemia guideline; 2025 AHA/ACC high blood pressure guideline'
  },
  // ===================== Lung =====================
  {
    id: 'asthma', name: 'Acute asthma severity (adult)', cat: 'Lung', specs: ['Pulmonary', 'ICU', 'Allergy & Immunology'],
    fields: [{ k: 'pef', l: 'PEF', u: '% of best or predicted' }, { k: 'rr', l: 'Respiratory rate', u: '/min', pre: P => P.vit('rr') },
      { k: 'hr', l: 'Heart rate', u: 'bpm', pre: P => P.vit('hr') }, { k: 'spo2', l: 'SpO2', u: '%', pre: P => P.vit('spo2') },
      { k: 'sent', l: "Can't complete sentences in one breath", t: 'chk' },
      LAB('pao2', 'PaO2 (optional)', 'mmHg', 'pO2'), LAB('paco2', 'PaCO2 (optional)', 'mmHg', 'pCO2'),
      { k: 'silent', l: 'Silent chest', t: 'chk' }, { k: 'cyan', l: 'Cyanosis', t: 'chk' }, { k: 'effort', l: 'Poor respiratory effort', t: 'chk' },
      { k: 'arr', l: 'Arrhythmia', t: 'chk' }, { k: 'exh', l: 'Exhaustion', t: 'chk' }, { k: 'loc', l: 'Altered consciousness', t: 'chk' },
      { k: 'hypo', l: 'Hypotension', t: 'chk' }, { k: 'vent', l: 'Needs ventilation with raised inflation pressures', t: 'chk' }],
    calc: v => {
      const life = [], sev = [];
      if (has(v.pef) && v.pef < 33) life.push('PEF <33%');
      if (has(v.spo2) && v.spo2 < 92) life.push('SpO2 <92%');
      if (has(v.pao2) && v.pao2 < 60) life.push('PaO2 <60 mmHg');
      if (has(v.paco2) && v.paco2 >= 35 && v.paco2 <= 45) life.push("'Normal' PaCO2 (35–45 mmHg)");
      [['silent', 'silent chest'], ['cyan', 'cyanosis'], ['effort', 'poor respiratory effort'], ['arr', 'arrhythmia'], ['exh', 'exhaustion'], ['loc', 'altered consciousness'], ['hypo', 'hypotension']].forEach(([k, l]) => { if (v[k]) life.push(l); });
      if (has(v.pef) && v.pef >= 33 && v.pef <= 50) sev.push('PEF 33–50%');
      if (has(v.rr) && v.rr >= 25) sev.push('RR ≥25');
      if (has(v.hr) && v.hr >= 110) sev.push('HR ≥110');
      if (v.sent) sev.push("can't complete sentences");
      const nearFatal = (has(v.paco2) && v.paco2 > 45) || v.vent;
      const anyInput = [v.pef, v.rr, v.hr, v.spo2, v.pao2, v.paco2].some(has) || life.length || sev.length || v.vent;
      if (!anyInput) return null;
      let main, level, lines = [];
      if (nearFatal) { main = 'Near-fatal asthma'; level = 'high'; lines.push('Raised PaCO2 and/or needing mechanical ventilation — ICU now'); }
      else if (life.length) { main = 'Life-threatening asthma'; level = 'high'; lines.push('Features: ' + life.join(', '), 'Senior/ICU review; check ABG'); }
      else if (sev.length) { main = 'Acute severe asthma'; level = 'high'; lines.push('Features: ' + sev.join(', ')); }
      else if (has(v.pef) && v.pef > 75) { main = 'No features of acute severe asthma (PEF >75%)'; level = 'ok'; }
      else { main = 'Moderate acute asthma'; level = 'warn'; lines.push('PEF >50–75% and no features of acute severe asthma'); }
      return { main, level, lines, text: `Asthma severity: ${main}${life.length || sev.length ? ' (' + [...life, ...sev].join(', ') + ')' : ''}` };
    },
    ref: 'BTS/SIGN British guideline on the management of asthma (SIGN 158), 2019'
  },
  {
    id: 'curb65', name: 'CURB-65 (pneumonia severity)', cat: 'Lung', specs: ['Pulmonary', 'ICU', 'Geriatrics', 'Infectious Diseases'],
    fields: [{ k: 'conf', l: 'New confusion', t: 'chk', pts: 1 }, LAB('urea', 'Urea', 'mg/dL', 'Urea'),
      { k: 'rr', l: 'Respiratory rate', u: '/min', pre: P => P.vit('rr') }, { k: 'sbp', l: 'Systolic BP', u: 'mmHg', pre: P => P.vit('sbp') },
      { k: 'dbp', l: 'Diastolic BP', u: 'mmHg', pre: P => P.vit('dbp') }, AGE],
    calc: v => {
      if (![v.urea, v.rr, v.sbp, v.dbp, v.age].some(has) && !v.conf) return null;
      const pts = [];
      if (v.conf) pts.push('confusion');
      if (has(v.urea) && v.urea > 42) pts.push('urea >42 mg/dL (>7 mmol/L)');
      if (has(v.rr) && v.rr >= 30) pts.push('RR ≥30');
      if ((has(v.sbp) && v.sbp < 90) || (has(v.dbp) && v.dbp <= 60)) pts.push('low BP');
      if (has(v.age) && v.age >= 65) pts.push('age ≥65');
      const s = pts.length;
      const t = s <= 1 ? 'Low risk — consider home treatment' : s === 2 ? 'Moderate risk — consider hospital treatment' : `High risk — treat as severe pneumonia in hospital${s >= 4 ? '; assess for ICU' : ''}`;
      return { main: `CURB-65 ${s}`, level: s >= 3 ? 'high' : s === 2 ? 'warn' : 'ok', lines: [t, pts.length ? 'Points: ' + pts.join(', ') : 'No points'],
        text: `CURB-65 ${s} — ${t.split(' — ')[0].toLowerCase()}` };
    },
    ref: 'Lim WS et al. Thorax 2003;58:377–82'
  },
  {
    id: 'wellspe', name: 'Wells score for PE', cat: 'Lung', specs: ['Pulmonary', 'Cardiology', 'ICU', 'Hematology', 'Oncology'],
    fields: [{ k: 'dvt', l: 'Clinical signs of DVT', t: 'chk', pts: 3 }, { k: 'likely', l: 'PE is the most likely diagnosis', t: 'chk', pts: 3 },
      { k: 'hr', l: 'Heart rate >100', t: 'chk', pts: 1.5, pre: P => { const h = P.vit('hr'); return h ? { v: h.v > 100, src: h.src } : null; } },
      { k: 'imm', l: 'Immobilized ≥3 days or surgery in the last 4 weeks', t: 'chk', pts: 1.5 },
      { k: 'prev', l: 'Previous DVT or PE', t: 'chk', pts: 1.5, pre: P => P.has('Previous VTE', 'DVT', 'PE') },
      { k: 'hemo', l: 'Hemoptysis', t: 'chk', pts: 1, pre: P => P.has('Hemoptysis') },
      { k: 'ca', l: 'Cancer (treated in last 6 months or palliative)', t: 'chk', pts: 1, pre: P => P.has('Malignancy', 'On chemotherapy', CANCER_RE) }],
    calc: v => {
      const s = (v.dvt ? 3 : 0) + (v.likely ? 3 : 0) + (v.hr ? 1.5 : 0) + (v.imm ? 1.5 : 0) + (v.prev ? 1.5 : 0) + (v.hemo ? 1 : 0) + (v.ca ? 1 : 0);
      const two = s > 4 ? 'PE likely — CT pulmonary angiography' : 'PE unlikely — D-dimer to rule out';
      const three = s > 6 ? 'high' : s >= 2 ? 'moderate' : 'low';
      return { main: `Wells ${s}`, level: s > 4 ? 'high' : 'ok', lines: [two, `Three-tier: ${three} probability`], text: `Wells PE ${s} — ${two.split(' — ')[0].toLowerCase()}` };
    },
    ref: 'Wells PS et al. Thromb Haemost 2000;83:416–20'
  },
  // ===================== ICU & neuro =====================
  {
    id: 'gcs', name: 'Glasgow Coma Scale', cat: 'ICU & neuro', specs: ['ICU', 'Neurology'],
    fields: [
      { k: 'e', l: 'Eye opening', t: 'sel', opts: [['4', '4 — spontaneous'], ['3', '3 — to sound'], ['2', '2 — to pressure/pain'], ['1', '1 — none']] },
      { k: 'v', l: 'Verbal response', t: 'sel', opts: [['5', '5 — oriented'], ['4', '4 — confused'], ['3', '3 — inappropriate words'], ['2', '2 — sounds only'], ['1', '1 — none'], ['T', 'T — intubated']] },
      { k: 'm', l: 'Motor response', t: 'sel', opts: [['6', '6 — obeys commands'], ['5', '5 — localizes pain'], ['4', '4 — withdraws (normal flexion)'], ['3', '3 — abnormal flexion'], ['2', '2 — extension'], ['1', '1 — none']] }],
    calc: v => {
      if (!v.e || !v.v || !v.m) return null;
      const e = Number(v.e), m = Number(v.m);
      if (v.v === 'T') return { main: `GCS E${e} VT M${m} (intubated)`, level: 'warn', lines: [`Eye + motor = ${e + m}; verbal not testable`], text: `GCS E${e}VTM${m}` };
      const vb = Number(v.v), t = e + vb + m;
      const sev = t <= 8 ? 'Severe (≤8) — protect the airway' : t <= 12 ? 'Moderate (9–12)' : 'Mild (13–15)';
      return { main: `GCS ${t}/15 (E${e} V${vb} M${m})`, level: t <= 8 ? 'high' : t <= 12 ? 'warn' : 'ok', lines: [sev], text: `GCS ${t} (E${e}V${vb}M${m})` };
    },
    ref: 'Teasdale G, Jennett B. Lancet 1974;2:81–4'
  },
  {
    id: 'qsofa', name: 'qSOFA', cat: 'ICU & neuro', specs: ['ICU', 'Pulmonary', 'Oncology', 'Infectious Diseases'],
    fields: [{ k: 'rr', l: 'Respiratory rate', u: '/min', pre: P => P.vit('rr') }, { k: 'sbp', l: 'Systolic BP', u: 'mmHg', pre: P => P.vit('sbp') },
      { k: 'ment', l: 'Altered mentation (GCS <15)', t: 'chk', pre: P => { const g = P.vit('gcs'); return g ? { v: g.v < 15, src: g.src } : null; } }],
    calc: v => {
      if (!has(v.rr) && !has(v.sbp) && !v.ment) return null;
      const s = (has(v.rr) && v.rr >= 22 ? 1 : 0) + (has(v.sbp) && v.sbp <= 100 ? 1 : 0) + (v.ment ? 1 : 0);
      return { main: `qSOFA ${s}/3`, level: s >= 2 ? 'high' : 'ok',
        lines: [s >= 2 ? 'Higher risk of poor outcome — look for organ dysfunction (SOFA)' : 'Lower risk', 'Not recommended as the only sepsis screening tool (Surviving Sepsis 2021)'],
        text: `qSOFA ${s}` };
    },
    ref: 'Seymour CW et al. JAMA 2016;315:762–74'
  },
  // ===================== Blood =====================
  {
    id: '4ts', name: '4Ts score for HIT', cat: 'Blood', specs: ['Hematology', 'Cardiology', 'ICU'],
    fields: [
      { k: 't1', l: 'Thrombocytopenia', t: 'sel', opts: [['2', '2 — fall >50% and nadir ≥20'], ['1', '1 — fall 30–50% or nadir 10–19'], ['0', '0 — fall <30% or nadir <10']] },
      { k: 't2', l: 'Timing of the fall', t: 'sel', opts: [['2', '2 — day 5–10, or ≤1 day with heparin in last 30 days'], ['1', '1 — probably day 5–10, after day 10, or ≤1 day with heparin 30–100 days ago'], ['0', '0 — <4 days without recent heparin']] },
      { k: 't3', l: 'Thrombosis or other sequelae', t: 'sel', opts: [['2', '2 — new thrombosis, skin necrosis, or reaction after heparin bolus'], ['1', '1 — progressive/recurrent or suspected thrombosis'], ['0', '0 — none']] },
      { k: 't4', l: 'Other cause for low platelets', t: 'sel', opts: [['2', '2 — none apparent'], ['1', '1 — possible'], ['0', '0 — definite']] }],
    calc: v => {
      if (!['t1', 't2', 't3', 't4'].every(k => has(v[k]))) return null;
      const s = ['t1', 't2', 't3', 't4'].reduce((t, k) => t + Number(v[k]), 0);
      const t = s <= 3 ? 'Low probability — HIT unlikely' : s <= 5 ? 'Intermediate probability' : 'High probability';
      return { main: `4Ts ${s}/8`, level: s >= 6 ? 'high' : s >= 4 ? 'warn' : 'ok',
        lines: [t, s >= 4 ? 'Stop all heparin, start a non-heparin anticoagulant and send HIT antibodies' : 'Antibody testing usually not needed'],
        text: `4Ts ${s} — ${t.toLowerCase()}` };
    },
    ref: 'Lo GK et al. J Thromb Haemost 2006;4:759–65; ASH HIT guideline 2018'
  },
  {
    id: 'rpi', name: 'Reticulocyte production index', cat: 'Blood', specs: ['Hematology'],
    fields: [LAB('ret', 'Reticulocytes', '%', 'Retic'), LAB('hct', 'Hematocrit', '%', 'Hct')],
    calc: v => {
      if (![v.ret, v.hct].every(has)) return null;
      const corr = v.ret * v.hct / 45;
      const mf = v.hct >= 40 ? 1 : v.hct >= 30 ? 1.5 : v.hct >= 20 ? 2 : 2.5;
      const rpi = corr / mf;
      const t = rpi < 2 ? 'Inadequate marrow response (hypoproliferative anemia)' : rpi >= 3 ? 'Adequate marrow response (hemolysis or blood loss)' : 'Borderline response';
      return { main: `RPI ${r1(rpi)}`, level: rpi < 2 ? 'warn' : 'ok', lines: [`Corrected reticulocytes ${r1(corr)}% · maturation factor ${mf}`, t], text: `RPI ${r1(rpi)} — ${t.toLowerCase()}` };
    },
    ref: 'Hillman RS, Finch CA. Red cell manual'
  },
  {
    id: 'anc', name: 'Absolute neutrophil count', cat: 'Blood', specs: ['Hematology', 'Oncology', 'Infectious Diseases'],
    fields: [LAB('wbc', 'WBC', '×10³/µL', 'WBC'), { k: 'neut', l: 'Neutrophils', u: '%' }, { k: 'bands', l: 'Bands (optional)', u: '%' }],
    calc: v => {
      if (![v.wbc, v.neut].every(has)) return null;
      const a = v.wbc * (v.neut + (has(v.bands) ? v.bands : 0)) / 100;
      const t = a < 0.5 ? 'Severe neutropenia (<0.5)' : a < 1 ? 'Moderate neutropenia (0.5–1.0)' : a < 1.5 ? 'Mild neutropenia (1.0–1.5)' : 'Normal';
      return { main: `ANC ${r2(a)} ×10³/µL`, level: a < 0.5 ? 'high' : a < 1.5 ? 'warn' : 'ok', lines: [t], text: `ANC ${r2(a)} ×10³/µL — ${t.toLowerCase()}` };
    },
    ref: 'ANC = WBC × (neutrophils% + bands%)'
  },
  // ===================== Endocrine & rheumatology =====================
  {
    id: 'steroid', name: 'Steroid dose converter', cat: 'Endocrine & metabolic', specs: ['Endocrine', 'Rheumatology', 'Pulmonary', 'Oncology', 'Gastroenterology', 'Allergy & Immunology'],
    fields: [{ k: 'drug', l: 'Steroid', t: 'sel', opts: [['20', 'Hydrocortisone'], ['5', 'Prednisolone'], ['5p', 'Prednisone'], ['4', 'Methylprednisolone'], ['0.75', 'Dexamethasone']], def: '5' },
      { k: 'dose', l: 'Daily dose', u: 'mg' }],
    calc: v => {
      if (!has(v.dose) || !v.drug) return null;
      const eq = parseFloat(v.drug), pred = v.dose / eq * 5;
      const L = [['Hydrocortisone', 20], ['Prednisolone / prednisone', 5], ['Methylprednisolone', 4], ['Dexamethasone', 0.75]].map(([n, e]) => `${n} ${r1(pred / 5 * e)} mg`);
      return { main: `≈ Prednisolone ${r1(pred)} mg`, level: 'ok', lines: [...L, 'Glucocorticoid potency only — mineralocorticoid effect and duration differ'], text: `Steroid equivalent ≈ prednisolone ${r1(pred)} mg/day` };
    },
    ref: 'Standard glucocorticoid equivalence table'
  },
  {
    id: 'das28', name: 'DAS28 (rheumatoid arthritis activity)', cat: 'Rheumatology', specs: ['Rheumatology'],
    fields: [{ k: 'tjc', l: 'Tender joints (0–28)', u: '' }, { k: 'sjc', l: 'Swollen joints (0–28)', u: '' },
      LAB('esr', 'ESR', 'mm/h', 'ESR'), LAB('crp', 'CRP', 'mg/L', 'CRP'), { k: 'gh', l: 'Patient global health (0–100)', u: 'mm' }],
    calc: v => {
      if (![v.tjc, v.sjc, v.gh].every(has) || (!has(v.esr) && !has(v.crp))) return null;
      if (v.tjc > 28 || v.sjc > 28 || v.gh > 100) return { main: 'Check the entries', level: 'warn', lines: ['Joint counts are out of 28; global health is 0–100'], text: '' };
      const cat = d => d < 2.6 ? 'remission' : d <= 3.2 ? 'low activity' : d <= 5.1 ? 'moderate activity' : 'high activity';
      const base = 0.56 * Math.sqrt(v.tjc) + 0.28 * Math.sqrt(v.sjc) + 0.014 * v.gh;
      const out = [];
      if (has(v.esr) && v.esr > 0) { const d = base + 0.70 * Math.log(v.esr); out.push(['ESR', d]); }
      if (has(v.crp)) { const d = base + 0.36 * Math.log(v.crp + 1) + 0.96; out.push(['CRP', d]); }
      if (!out.length) return null;
      const top = out[0][1];
      return { main: out.map(([n, d]) => `DAS28-${n} ${r2(d)}`).join(' · '), level: top > 5.1 ? 'high' : top > 3.2 ? 'warn' : 'ok',
        lines: out.map(([n, d]) => `DAS28-${n}: ${cat(d)}`).concat(['Cut-offs: <2.6 remission, ≤3.2 low, ≤5.1 moderate, >5.1 high']),
        text: out.map(([n, d]) => `DAS28-${n} ${r2(d)} (${cat(d)})`).join('; ') };
    },
    ref: 'Prevoo ML et al. Arthritis Rheum 1995;38:44–8'
  },
  // ===================== Liver & GI =====================
  {
    id: 'childpugh', name: 'Child–Pugh score', cat: 'Liver & GI', specs: ['Gastroenterology', 'ICU'],
    fields: [LAB('bili', 'Total bilirubin', 'mg/dL', 'T.Bil'), LAB('alb', 'Albumin', 'g/dL', 'Alb'), LAB('inr', 'INR', '', 'INR'),
      { k: 'asc', l: 'Ascites', t: 'seg', opts: [['1', 'None'], ['2', 'Mild'], ['3', 'Mod–severe']] },
      { k: 'he', l: 'Encephalopathy', t: 'seg', opts: [['1', 'None'], ['2', 'Grade 1–2'], ['3', 'Grade 3–4']] }],
    calc: v => {
      if (![v.bili, v.alb, v.inr, v.asc, v.he].every(has)) return null;
      const b = v.bili < 2 ? 1 : v.bili <= 3 ? 2 : 3, al = v.alb > 3.5 ? 1 : v.alb >= 2.8 ? 2 : 3, i = v.inr < 1.7 ? 1 : v.inr <= 2.3 ? 2 : 3;
      const s = b + al + i + Number(v.asc) + Number(v.he);
      const c = s <= 6 ? 'A' : s <= 9 ? 'B' : 'C';
      const t = { A: 'Well-compensated disease', B: 'Significant functional compromise', C: 'Decompensated disease' }[c];
      return { main: `Child–Pugh ${c} (${s} points)`, level: c === 'C' ? 'high' : c === 'B' ? 'warn' : 'ok',
        lines: [t, `Points: bilirubin ${b}, albumin ${al}, INR ${i}, ascites ${v.asc}, encephalopathy ${v.he}`, 'Class A 5–6, B 7–9, C 10–15'],
        text: `Child–Pugh ${c} (${s}) — ${t.toLowerCase()}` };
    },
    ref: 'Pugh RN et al. Br J Surg 1973;60:646–9'
  },
  {
    id: 'meld', name: 'MELD 3.0 and MELD-Na', cat: 'Liver & GI', specs: ['Gastroenterology', 'ICU', 'Nephrology'],
    fields: [LAB('bili', 'Total bilirubin', 'mg/dL', 'T.Bil'), LAB('inr', 'INR', '', 'INR'), LAB('cr', 'Creatinine', 'mg/dL', 'Cr'),
      LAB('na', 'Sodium', 'mmol/L', 'Na'), LAB('alb', 'Albumin', 'g/dL', 'Alb'), SEX,
      { k: 'dial', l: 'Dialysis ≥2 times (or CRRT 24 h) in the past week', t: 'chk', pre: P => P.has('ESKD on HD', 'ESKD on PD', 'AKI – on dialysis (RRT)') }],
    calc: v => {
      if (![v.bili, v.inr, v.cr, v.na].every(has) || v.bili <= 0 || v.inr <= 0 || v.cr <= 0) return null;
      const bil = Math.max(v.bili, 1), inr = Math.max(v.inr, 1), na = Math.min(Math.max(v.na, 125), 137);
      // MELD-Na (UNOS 2016)
      const crN = v.dial ? 4 : Math.min(Math.max(v.cr, 1), 4);
      let m = 10 * (0.957 * Math.log(crN) + 0.378 * Math.log(bil) + 1.12 * Math.log(inr) + 0.643);
      m = Math.round(m * 10) / 10;
      let mna = m > 11 ? m + 1.32 * (137 - na) - 0.033 * m * (137 - na) : m;
      mna = Math.min(Math.max(r0(mna), 6), 40);
      const lines = [];
      let m3 = null;
      if (has(v.alb) && v.sex) {
        const cr3 = v.dial ? 3 : Math.min(Math.max(v.cr, 1), 3), alb = Math.min(Math.max(v.alb, 1.5), 3.5);
        m3 = (v.sex === 'F' ? 1.33 : 0) + 4.56 * Math.log(bil) + 0.82 * (137 - na) - 0.24 * (137 - na) * Math.log(bil) + 9.09 * Math.log(inr)
          + 11.14 * Math.log(cr3) + 1.85 * (3.5 - alb) - 1.83 * (3.5 - alb) * Math.log(cr3) + 6;
        m3 = Math.min(Math.max(r0(m3), 6), 40);
      } else lines.push('Add albumin and sex for MELD 3.0');
      const use = m3 !== null ? m3 : mna;
      const mort = use < 10 ? '≈2%' : use < 20 ? '≈6%' : use < 30 ? '≈20%' : use < 40 ? '≈53%' : '≈71%';
      lines.push(`Approximate 3-month mortality ${mort}`);
      if (use >= 15) lines.push('MELD ≥15: refer for liver transplant assessment');
      return { main: (m3 !== null ? `MELD 3.0 ${m3} · ` : '') + `MELD-Na ${mna}`, level: use >= 20 ? 'high' : use >= 10 ? 'warn' : 'ok', lines,
        text: (m3 !== null ? `MELD 3.0 ${m3}, ` : '') + `MELD-Na ${mna}` };
    },
    ref: 'Kim WR et al. Gastroenterology 2021;161:1887–95 (MELD 3.0); Kim WR et al. N Engl J Med 2008;359:1018–26 (MELD-Na)'
  },
  {
    id: 'gbs', name: 'Glasgow–Blatchford (upper GI bleed)', cat: 'Liver & GI', specs: ['Gastroenterology', 'ICU'],
    fields: [LAB('urea', 'Urea', 'mg/dL', 'Urea'), LAB('hb', 'Hemoglobin', 'g/dL', 'Hb'), SEX,
      { k: 'sbp', l: 'Systolic BP', u: 'mmHg', pre: P => P.vit('sbp') }, { k: 'hr', l: 'Heart rate', u: 'bpm', pre: P => P.vit('hr') },
      { k: 'mel', l: 'Melena', t: 'chk', pts: 1 }, { k: 'syn', l: 'Syncope', t: 'chk', pts: 2 },
      { k: 'liv', l: 'Liver disease', t: 'chk', pts: 2, pre: P => P.has('Chronic liver disease', /^Cirrhosis/) },
      { k: 'hf', l: 'Heart failure', t: 'chk', pts: 2, pre: P => P.has('HF', /^Heart failure/) }],
    calc: v => {
      if (![v.urea, v.hb, v.sbp, v.sex].every(has)) return null;
      const u = v.urea / 6.006; // urea mg/dL → mmol/L
      let s = u >= 25 ? 6 : u >= 10 ? 4 : u >= 8 ? 3 : u >= 6.5 ? 2 : 0;
      if (v.sex === 'M') s += v.hb < 10 ? 6 : v.hb < 12 ? 3 : v.hb < 13 ? 1 : 0;
      else s += v.hb < 10 ? 6 : v.hb < 12 ? 1 : 0;
      s += v.sbp < 90 ? 3 : v.sbp < 100 ? 2 : v.sbp < 110 ? 1 : 0;
      if (has(v.hr) && v.hr >= 100) s += 1;
      s += (v.mel ? 1 : 0) + (v.syn ? 2 : 0) + (v.liv ? 2 : 0) + (v.hf ? 2 : 0);
      const t = s <= 1 ? 'Very low risk — may be suitable for outpatient management' : s < 7 ? 'Needs admission and endoscopy' : 'High risk — likely to need transfusion or endoscopic treatment';
      return { main: `Glasgow–Blatchford ${s}`, level: s <= 1 ? 'ok' : s < 7 ? 'warn' : 'high', lines: [t, `Urea ${r1(u)} mmol/L`],
        text: `Glasgow–Blatchford ${s} — ${t.split(' — ')[0].toLowerCase()}` };
    },
    ref: 'Blatchford O et al. Lancet 2000;356:1318–21; ESGE guideline 2021 (score ≤1 for outpatient care)'
  },
  {
    id: 'bisap', name: 'BISAP (acute pancreatitis)', cat: 'Liver & GI', specs: ['Gastroenterology', 'ICU'],
    fields: [LAB('urea', 'Urea', 'mg/dL', 'Urea'), { k: 'ams', l: 'Impaired mental status', t: 'chk', pts: 1 },
      { k: 'sirs', l: 'SIRS (≥2 of: T >38 or <36, HR >90, RR >20, WBC >12 or <4)', t: 'chk', pts: 1 }, AGE,
      { k: 'pe', l: 'Pleural effusion on imaging', t: 'chk', pts: 1 }],
    calc: v => {
      if (!has(v.urea) && !has(v.age) && !v.ams && !v.sirs && !v.pe) return null;
      const pts = [];
      if (has(v.urea) && v.urea > 53.5) pts.push('BUN >25 (urea >53.5 mg/dL)');
      if (v.ams) pts.push('mental status');
      if (v.sirs) pts.push('SIRS');
      if (has(v.age) && v.age > 60) pts.push('age >60');
      if (v.pe) pts.push('pleural effusion');
      const s = pts.length;
      return { main: `BISAP ${s}/5`, level: s >= 3 ? 'high' : s === 2 ? 'warn' : 'ok',
        lines: [s >= 3 ? 'Higher risk of severe pancreatitis and death — consider HDU/ICU' : 'Lower mortality risk (<2%)', pts.length ? 'Points: ' + pts.join(', ') : 'No points'],
        text: `BISAP ${s}${s >= 3 ? ' (high risk)' : ''}` };
    },
    ref: 'Wu BU et al. Gut 2008;57:1698–703'
  },
  {
    id: 'fib4', name: 'FIB-4 (liver fibrosis)', cat: 'Liver & GI', specs: ['Gastroenterology', 'Endocrine'],
    fields: [AGE, LAB('ast', 'AST', 'U/L', 'AST'), LAB('alt', 'ALT', 'U/L', 'ALT'), LAB('plt', 'Platelets', '×10³/µL', 'Plt')],
    calc: v => {
      if (![v.age, v.ast, v.alt, v.plt].every(has) || v.alt <= 0 || v.plt <= 0) return null;
      const f = v.age * v.ast / (v.plt * Math.sqrt(v.alt)), low = v.age >= 65 ? 2.0 : 1.3;
      const t = f < low ? 'Low risk of advanced fibrosis' : f > 2.67 ? 'High risk of advanced fibrosis — hepatology referral' : 'Indeterminate — check liver elastography (FibroScan)';
      return { main: `FIB-4 ${r2(f)}`, level: f > 2.67 ? 'high' : f >= low ? 'warn' : 'ok',
        lines: [t, `Cut-offs: <${low}${v.age >= 65 ? ' (age ≥65)' : ''} low, >2.67 high`, v.age < 35 ? 'Less reliable under age 35' : 'Validated mainly in MASLD and viral hepatitis'],
        text: `FIB-4 ${r2(f)} — ${t.split(' — ')[0].toLowerCase()}` };
    },
    ref: 'Sterling RK et al. Hepatology 2006;43:1317–25; AASLD MASLD guidance 2023'
  },
  {
    id: 'maddrey', name: 'Maddrey discriminant function (alcoholic hepatitis)', cat: 'Liver & GI', specs: ['Gastroenterology'],
    fields: [LAB('pt', 'Prothrombin time', 's', 'PT'), { k: 'ctl', l: 'Control PT', u: 's' }, LAB('bili', 'Total bilirubin', 'mg/dL', 'T.Bil')],
    calc: v => {
      if (![v.pt, v.ctl, v.bili].every(has)) return null;
      const d = 4.6 * (v.pt - v.ctl) + v.bili;
      return { main: `Maddrey DF ${r1(d)}`, level: d >= 32 ? 'high' : 'ok',
        lines: [d >= 32 ? 'Severe alcoholic hepatitis (≥32): consider prednisolone 40 mg/day if no infection or GI bleeding; reassess with Lille at day 7' : 'Not severe (<32): supportive care'],
        text: `Maddrey DF ${r1(d)}${d >= 32 ? ' (severe)' : ''}` };
    },
    ref: 'Maddrey WC et al. Gastroenterology 1978;75:193–9'
  },
  // ===================== Oncology =====================
  {
    id: 'ecog', name: 'ECOG performance status', cat: 'Oncology', specs: ['Oncology', 'Hematology'],
    fields: [{ k: 'e', l: 'Best description', t: 'sel', opts: [['0', '0 — fully active, no restriction'], ['1', '1 — restricted in strenuous activity, can do light work'],
      ['2', '2 — self-care, unable to work, up >50% of waking hours'], ['3', '3 — limited self-care, in bed or chair >50% of waking hours'],
      ['4', '4 — completely disabled, totally confined to bed or chair'], ['5', '5 — dead']] }],
    calc: v => {
      if (!has(v.e)) return null;
      const e = Number(v.e), d = ['fully active', 'restricted in strenuous activity', 'ambulatory, self-care, unable to work', 'limited self-care', 'completely disabled', 'dead'][e];
      return { main: `ECOG ${e}`, level: e <= 1 ? 'ok' : e === 2 ? 'warn' : 'high',
        lines: [d.charAt(0).toUpperCase() + d.slice(1), e >= 3 ? 'Most cytotoxic chemotherapy is not recommended at ECOG 3–4' : 'Usually fit for systemic therapy'],
        text: `ECOG ${e} (${d})` };
    },
    ref: 'Oken MM et al. Am J Clin Oncol 1982;5:649–55'
  },
  {
    id: 'calvert', name: 'Carboplatin dose (Calvert)', cat: 'Oncology', specs: ['Oncology'],
    fields: [{ k: 'auc', l: 'Target AUC', u: 'mg/mL·min' }, AGE, SEX, WT, LAB('cr', 'Creatinine', 'mg/dL', 'Cr'), { k: 'gfr', l: 'Measured GFR (optional, overrides)', u: 'mL/min' }],
    calc: v => {
      if (!has(v.auc)) return null;
      let g, src;
      if (has(v.gfr)) { g = v.gfr; src = 'measured GFR'; }
      else {
        if (![v.age, v.sex, v.wt, v.cr].every(has) || v.cr <= 0) return null;
        g = (140 - v.age) * v.wt / (72 * v.cr) * (v.sex === 'F' ? 0.85 : 1); src = 'Cockcroft–Gault';
      }
      const capped = g > 125, gu = Math.min(g, 125), dose = v.auc * (gu + 25);
      return { main: `Carboplatin ${r0(dose)} mg`, level: 'ok',
        lines: [`AUC ${v.auc} × (GFR ${r0(gu)} + 25)`, `GFR from ${src}${capped ? ' — capped at 125 mL/min' : ''}`, 'Check against the protocol; many units round creatinine up to 0.7 mg/dL'],
        text: `Carboplatin AUC ${v.auc}: ${r0(dose)} mg (GFR ${r0(gu)}, ${src})` };
    },
    ref: 'Calvert AH et al. J Clin Oncol 1989;7:1748–56; FDA carboplatin dosing advice (GFR cap 125 mL/min)'
  },
  {
    id: 'mascc', name: 'MASCC (febrile neutropenia risk)', cat: 'Oncology', specs: ['Oncology', 'Hematology', 'Infectious Diseases'],
    fields: [{ k: 'bur', l: 'Burden of illness (symptoms)', t: 'seg', opts: [['5', 'None/mild'], ['3', 'Moderate'], ['0', 'Severe']] },
      { k: 'nohypo', l: 'No hypotension (SBP >90)', t: 'chk', pts: 5, pre: P => { const s = P.vit('sbp'); return s ? { v: s.v > 90, src: s.src } : null; } },
      { k: 'nocopd', l: 'No COPD', t: 'chk', pts: 4, pre: P => !P.has('COPD') },
      { k: 'solid', l: 'Solid tumor, or blood cancer without previous fungal infection', t: 'chk', pts: 4 },
      { k: 'nodeh', l: 'No dehydration needing IV fluids', t: 'chk', pts: 3 },
      { k: 'outpt', l: 'Outpatient when the fever started', t: 'chk', pts: 3 },
      { k: 'young', l: 'Age under 60', t: 'chk', pts: 2, pre: P => has(P.age) ? P.age < 60 : null }],
    calc: v => {
      if (!has(v.bur)) return null;
      const s = Number(v.bur) + (v.nohypo ? 5 : 0) + (v.nocopd ? 4 : 0) + (v.solid ? 4 : 0) + (v.nodeh ? 3 : 0) + (v.outpt ? 3 : 0) + (v.young ? 2 : 0);
      return { main: `MASCC ${s}/26`, level: s >= 21 ? 'ok' : 'high',
        lines: [s >= 21 ? 'Low risk (≥21): oral antibiotics or early discharge may be considered if the patient is otherwise suitable' : 'High risk (<21): admit for IV broad-spectrum antibiotics'],
        text: `MASCC ${s} — ${s >= 21 ? 'low' : 'high'} risk febrile neutropenia` };
    },
    ref: 'Klastersky J et al. J Clin Oncol 2000;18:3038–51'
  },
  {
    id: 'khorana', name: 'Khorana score (cancer VTE risk)', cat: 'Oncology', specs: ['Oncology', 'Hematology'],
    fields: [{ k: 'site', l: 'Cancer site', t: 'sel', opts: [['2', 'Stomach or pancreas (2)'], ['1', 'Lung, lymphoma, gynecologic, bladder or testicular (1)'], ['0', 'Other (0)']],
        pre: P => P.has('Gastric cancer', 'Pancreatic cancer') ? '2' : P.has('Lung cancer', /lymphoma/i, 'Ovarian cancer', 'Cervical cancer', 'Endometrial cancer', 'Bladder cancer', 'Testicular cancer') ? '1' : P.has(CANCER_RE) ? '0' : null },
      { k: 'plt', l: 'Platelets ≥350 ×10³/µL', t: 'chk', pts: 1, pre: P => { const x = P.lab('Plt'); return x ? { v: x.v >= 350, src: x.src } : null; } },
      { k: 'hb', l: 'Hb <10 g/dL or on an ESA', t: 'chk', pts: 1, pre: P => { const x = P.lab('Hb'); return x ? { v: x.v < 10, src: x.src } : null; } },
      { k: 'wbc', l: 'WBC >11 ×10³/µL', t: 'chk', pts: 1, pre: P => { const x = P.lab('WBC'); return x ? { v: x.v > 11, src: x.src } : null; } },
      { k: 'bmi', l: 'BMI ≥35', t: 'chk', pts: 1, pre: P => has(P.bmi) ? P.bmi >= 35 : null }],
    calc: v => {
      if (!has(v.site)) return null;
      const s = Number(v.site) + (v.plt ? 1 : 0) + (v.hb ? 1 : 0) + (v.wbc ? 1 : 0) + (v.bmi ? 1 : 0);
      const t = s === 0 ? 'Low risk' : s <= 2 ? 'Intermediate risk' : 'High risk';
      return { main: `Khorana ${s}`, level: s >= 3 ? 'high' : s >= 2 ? 'warn' : 'ok',
        lines: [t, s >= 2 ? 'Score ≥2 in an outpatient starting systemic therapy: consider thromboprophylaxis (apixaban, rivaroxaban or LMWH) if bleeding risk is low (ASCO)' : 'Routine thromboprophylaxis not indicated'],
        text: `Khorana ${s} — ${t.toLowerCase()} of VTE` };
    },
    ref: 'Khorana AA et al. Blood 2008;111:4902–7; ASCO VTE guideline 2023'
  },
  // ===================== Allergy & immunology =====================
  {
    id: 'anaph', name: 'Anaphylaxis criteria (WAO 2020) + adrenaline dose', cat: 'Allergy & immunology', specs: ['Allergy & Immunology', 'ICU', 'Pulmonary'],
    fields: [{ k: 'skin', l: 'Skin or mucosal signs (hives, itch, flushing, swollen lips/tongue)', t: 'chk' },
      { k: 'airway', l: 'Wheeze/bronchospasm, stridor or hoarseness', t: 'chk' },
      { k: 'resp', l: 'Other breathing difficulty (dyspnea, low SpO₂)', t: 'chk' },
      { k: 'bp', l: 'Low BP (SBP <90 or >30% fall) or collapse/syncope', t: 'chk' },
      { k: 'gi', l: 'Severe GI symptoms (cramping pain, repeated vomiting)', t: 'chk' },
      { k: 'allergen', l: 'Minutes–hours after a known or very likely allergen', t: 'chk' }, WT],
    calc: v => {
      if (!v.skin && !v.airway && !v.resp && !v.bp && !v.gi && !v.allergen) return null;
      const c1 = v.skin && (v.airway || v.resp || v.bp || v.gi), c2 = v.allergen && (v.bp || v.airway);
      const lines = [];
      if (c1 || c2) {
        const dose = has(v.wt) ? Math.min(0.01 * v.wt, 0.5) : 0.5;
        lines.push(`Meets WAO criterion ${[c1 ? 1 : 0, c2 ? 2 : 0].filter(Boolean).join(' and ')}`,
          `Adrenaline (epinephrine) 1 mg/mL IM ${r2(dose)} mg (${r2(dose)} mL) into the outer thigh${has(v.wt) ? '' : ' — adult dose; enter weight for 0.01 mg/kg'}; repeat after 5 min if no better`,
          'Lie flat with legs raised (sit up if breathless); high-flow oxygen; IV fluid bolus if hypotensive',
          'Serum tryptase within 2 h and a baseline level after 24 h; observe, then adrenaline auto-injector and allergy referral');
      } else lines.push('Does not meet the criteria now — keep observing; reassess if symptoms progress');
      return { main: c1 || c2 ? 'Anaphylaxis likely — give IM adrenaline' : 'Anaphylaxis criteria not met', level: c1 || c2 ? 'high' : 'ok', lines,
        text: c1 || c2 ? 'Meets WAO 2020 anaphylaxis criteria' : 'WAO anaphylaxis criteria not met' };
    },
    ref: 'Cardona V et al. World Allergy Organ J 2020;13:100472 (WAO anaphylaxis guidance)'
  },
  {
    id: 'penfast', name: 'PEN-FAST (penicillin allergy risk)', cat: 'Allergy & immunology', specs: ALL_SPECS,
    fields: [{ k: 'f', l: 'Reaction 5 years ago or less', t: 'chk', pts: 2 },
      { k: 'as', l: 'Anaphylaxis or angioedema, OR severe skin reaction (SJS/TEN, DRESS, AGEP)', t: 'chk', pts: 2 },
      { k: 'scar', l: '…the reaction was SJS/TEN, DRESS or AGEP (blistering or organ involvement)', t: 'chk' },
      { k: 't', l: 'Treatment was needed for the reaction', t: 'chk', pts: 1 }],
    calc: v => {
      const s = (v.f ? 2 : 0) + (v.as || v.scar ? 2 : 0) + (v.t ? 1 : 0);
      const risk = s === 0 ? 'very low (<1%)' : s <= 2 ? 'low (≈5%)' : s === 3 ? 'moderate (≈20%)' : 'high (≈50%)';
      const lines = [`Chance of a positive penicillin allergy test: ${risk}`];
      if (v.scar) lines.push('Severe delayed skin reaction: do NOT re-challenge — avoid the drug and refer to allergy');
      else if (s < 3) lines.push('Score <3: suitable for a supervised direct oral amoxicillin challenge (delabeling)');
      else lines.push('Score ≥3: refer for allergy testing before using penicillins');
      return { main: `PEN-FAST ${s}/5`, level: v.scar || s >= 3 ? 'high' : 'ok', lines, text: `PEN-FAST ${s} — ${risk.replace(/ \(.*/, '')} risk${v.scar ? ', SCAR history (no challenge)' : ''}` };
    },
    ref: 'Trubiano JA et al. JAMA Intern Med 2020;180:745–52; Copaescu AM et al. JAMA Intern Med 2023 (PALACE trial)'
  },
  {
    id: 'scorten', name: 'SCORTEN (SJS/TEN mortality)', cat: 'Allergy & immunology', specs: ['Allergy & Immunology', 'ICU'],
    fields: [{ k: 'age', l: 'Age 40 or over', t: 'chk', pts: 1, pre: P => has(P.age) ? P.age >= 40 : null },
      { k: 'ca', l: 'Cancer (solid or blood)', t: 'chk', pts: 1, pre: P => P.has('Malignancy', 'On chemotherapy', CANCER_RE) || null },
      { k: 'hr', l: 'Heart rate 120 or more', t: 'chk', pts: 1, pre: P => { const x = P.vit('hr'); return x ? { v: x.v >= 120, src: x.src } : null; } },
      { k: 'bsa', l: 'Skin detachment over 10% of body surface on day 1', t: 'chk', pts: 1 },
      { k: 'urea', l: 'Urea over 60 mg/dL (10 mmol/L)', t: 'chk', pts: 1, pre: P => { const x = P.lab('Urea'); return x ? { v: x.v > 60, src: x.src } : null; } },
      { k: 'hco3', l: 'Bicarbonate under 20 mmol/L', t: 'chk', pts: 1, pre: P => { const x = P.lab('HCO3'); return x ? { v: x.v < 20, src: x.src } : null; } },
      { k: 'glu', l: 'Glucose over 252 mg/dL (14 mmol/L)', t: 'chk', pts: 1, pre: P => { const x = P.lab('Glu'); return x ? { v: x.v > 252, src: x.src } : null; } }],
    calc: v => {
      const s = ['age', 'ca', 'hr', 'bsa', 'urea', 'hco3', 'glu'].filter(k => v[k]).length;
      const m = ['≈3%', '≈3%', '≈12%', '≈35%', '≈58%', '>90%', '>90%', '>90%'][s];
      return { main: `SCORTEN ${s}/7`, level: s >= 3 ? 'high' : s === 2 ? 'warn' : 'ok',
        lines: [`Predicted mortality ${m}`, 'Score in the first 24 h and again on day 3; ≥3 suggests care in a burns unit or ICU'],
        text: `SCORTEN ${s} (predicted mortality ${m})` };
    },
    ref: 'Bastuji-Garin S et al. J Invest Dermatol 2000;115:149–53'
  },
  {
    id: 'regiscar', name: 'RegiSCAR score (DRESS)', cat: 'Allergy & immunology', specs: ['Allergy & Immunology', 'ICU', 'Nephrology', 'Hematology'],
    fields: [{ k: 'fev', l: 'Fever ≥38.5 °C', t: 'seg', opts: [['0', 'Yes'], ['-1', 'No / unknown']] },
      { k: 'ln', l: 'Enlarged lymph nodes (>1 cm, ≥2 sites)', t: 'chk', pts: 1 },
      { k: 'eos', l: 'Eosinophils', t: 'seg', opts: [['0', '<0.7'], ['1', '0.7–1.49'], ['2', '≥1.5 ×10³/µL']],
        pre: P => { const x = P.lab('Eos'); return x ? { v: x.v >= 1.5 ? '2' : x.v >= 0.7 ? '1' : '0', src: x.src } : null; } },
      { k: 'atl', l: 'Atypical lymphocytes', t: 'chk', pts: 1 },
      { k: 'ext', l: 'Rash over 50% of body surface', t: 'chk', pts: 1 },
      { k: 'rash', l: 'Rash suggests DRESS (≥2 of facial edema, infiltration, purpura, scaling)', t: 'seg', opts: [['1', 'Yes'], ['0', 'Unknown'], ['-1', 'No']] },
      { k: 'bx', l: 'Skin biopsy suggests another diagnosis', t: 'chk', pts: -1 },
      { k: 'org', l: 'Internal organs involved (liver, kidney, lung, heart, pancreas…)', t: 'seg', opts: [['0', 'None'], ['1', 'One'], ['2', 'Two or more']] },
      { k: 'res', l: 'Resolution in 15 days or more', t: 'seg', opts: [['0', 'Yes'], ['-1', 'No / unknown']] },
      { k: 'exc', l: 'Other causes excluded (≥3 tests negative: hepatitis A/B/C, mycoplasma, chlamydia, ANA, blood culture)', t: 'chk', pts: 1 }],
    calc: v => {
      if (![v.fev, v.eos, v.rash, v.org, v.res].some(has) && !v.ln && !v.atl && !v.ext && !v.exc) return null;
      const n = k => has(v[k]) ? Number(v[k]) : 0;
      const fev = has(v.fev) ? Number(v.fev) : -1, res = has(v.res) ? Number(v.res) : -1;
      const s = fev + (v.ln ? 1 : 0) + n('eos') + (v.atl ? 1 : 0) + (v.ext ? 1 : 0) + n('rash') + (v.bx ? -1 : 0) + n('org') + res + (v.exc ? 1 : 0);
      const c = s < 2 ? 'No case' : s <= 3 ? 'Possible DRESS' : s <= 5 ? 'Probable DRESS' : 'Definite DRESS';
      return { main: `RegiSCAR ${s} — ${c}`, level: s >= 4 ? 'high' : s >= 2 ? 'warn' : 'ok',
        lines: [s >= 2 ? 'Stop all suspected drugs, avoid new ones, and assess liver, kidney and heart involvement' : 'DRESS unlikely — look for other causes', 'Bands: <2 no case, 2–3 possible, 4–5 probable, >5 definite', 'Unanswered fever or resolution items count as −1'],
        text: `RegiSCAR ${s} — ${c}` };
    },
    ref: 'Kardaun SH et al. Br J Dermatol 2013;169:1071–80 (RegiSCAR)'
  },
  // ===================== Geriatrics =====================
  {
    id: 'fourat', name: '4AT (delirium screen)', cat: 'Geriatrics', specs: ['Geriatrics', 'ICU', 'Oncology', 'Neurology'],
    fields: [{ k: 'alert', l: 'Alertness', t: 'seg', opts: [['0', 'Normal / mild sleepiness <10 s'], ['4', 'Clearly abnormal']] },
      { k: 'amt', l: 'AMT4: age, date of birth, place, current year', t: 'seg', opts: [['0', 'No mistakes'], ['1', '1 mistake'], ['2', '≥2 or untestable']] },
      { k: 'att', l: 'Attention: months of the year backwards', t: 'seg', opts: [['0', '≥7 months correct'], ['1', 'Starts, <7 / refuses'], ['2', 'Untestable']] },
      { k: 'acute', l: 'Acute change or fluctuating course', t: 'seg', opts: [['0', 'No'], ['4', 'Yes']] }],
    calc: v => {
      if (![v.alert, v.amt, v.att, v.acute].every(has)) return null;
      const s = Number(v.alert) + Number(v.amt) + Number(v.att) + Number(v.acute);
      const t = s >= 4 ? 'Possible delirium (± cognitive impairment) — look for causes: infection, drugs, retention, constipation, pain, electrolytes' : s >= 1 ? 'Possible cognitive impairment — consider fuller cognitive testing' : 'Delirium or severe cognitive impairment unlikely';
      return { main: `4AT ${s}/12`, level: s >= 4 ? 'high' : s >= 1 ? 'warn' : 'ok', lines: [t], text: `4AT ${s}${s >= 4 ? ' (possible delirium)' : ''}` };
    },
    ref: 'Bellelli G et al. Age Ageing 2014;43:496–502; www.the4at.com'
  },
  {
    id: 'cfs', name: 'Clinical Frailty Scale', cat: 'Geriatrics', specs: ['Geriatrics', 'ICU', 'Oncology', 'Cardiology'],
    fields: [{ k: 'c', l: 'Function about 2 weeks before this illness', t: 'sel', opts: [
      ['1', '1 — Very fit: robust, active, exercises regularly'], ['2', '2 — Fit: no active disease, exercises occasionally'],
      ['3', '3 — Managing well: medical problems well controlled, not regularly active'], ['4', '4 — Very mild frailty: not dependent, but slowed or tired by day'],
      ['5', '5 — Mild frailty: needs help with higher tasks (finances, transport, housework)'], ['6', '6 — Moderate frailty: needs help outside and with bathing, stairs'],
      ['7', '7 — Severe frailty: dependent for personal care, but stable'], ['8', '8 — Very severe frailty: completely dependent, approaching end of life'],
      ['9', '9 — Terminally ill: life expectancy under 6 months']] }],
    calc: v => {
      if (!has(v.c)) return null;
      const c = Number(v.c), t = c <= 3 ? 'Not frail' : ['Very mild frailty', 'Mild frailty', 'Moderate frailty', 'Severe frailty', 'Very severe frailty', 'Terminally ill'][c - 4];
      return { main: `CFS ${c} — ${t}`, level: c >= 7 ? 'high' : c >= 5 ? 'warn' : 'ok',
        lines: [c >= 5 ? 'Consider comprehensive geriatric assessment, deprescribing and goals-of-care discussion' : 'Use with clinical judgment', 'Validated for people aged 65 and over'],
        text: `Clinical Frailty Scale ${c} (${t.toLowerCase()})` };
    },
    ref: 'Rockwood K et al. CMAJ 2005;173:489–95; CFS version 2.0 (2020)'
  },
  {
    id: 'mnasf', name: 'MNA-SF (nutrition screen)', cat: 'Geriatrics', specs: ['Geriatrics', 'Gastroenterology', 'Oncology'],
    fields: [{ k: 'a', l: 'Food intake fallen in the past 3 months', t: 'seg', opts: [['0', 'Severely'], ['1', 'Moderately'], ['2', 'No']] },
      { k: 'b', l: 'Weight loss in the past 3 months', t: 'seg', opts: [['0', '>3 kg'], ['1', 'Don\'t know'], ['2', '1–3 kg'], ['3', 'None']] },
      { k: 'c', l: 'Mobility', t: 'seg', opts: [['0', 'Bed or chair'], ['1', 'Indoors only'], ['2', 'Goes out']] },
      { k: 'd', l: 'Acute illness or psychological stress in the past 3 months', t: 'seg', opts: [['0', 'Yes'], ['2', 'No']] },
      { k: 'e', l: 'Dementia or depression', t: 'seg', opts: [['0', 'Severe'], ['1', 'Mild dementia'], ['2', 'None']] },
      { k: 'bmi', l: 'BMI', u: 'kg/m²', pre: P => P.bmi },
      { k: 'calf', l: 'Calf circumference (if no BMI)', u: 'cm' }],
    calc: v => {
      if (![v.a, v.b, v.c, v.d, v.e].every(has) || (!has(v.bmi) && !has(v.calf))) return null;
      const f = has(v.bmi) ? (v.bmi < 19 ? 0 : v.bmi < 21 ? 1 : v.bmi < 23 ? 2 : 3) : (v.calf < 31 ? 0 : 3);
      const s = Number(v.a) + Number(v.b) + Number(v.c) + Number(v.d) + Number(v.e) + f;
      const t = s >= 12 ? 'Normal nutritional status' : s >= 8 ? 'At risk of malnutrition' : 'Malnourished';
      return { main: `MNA-SF ${s}/14 — ${t}`, level: s >= 12 ? 'ok' : s >= 8 ? 'warn' : 'high',
        lines: [s < 12 ? 'Refer to the dietitian; check weight weekly and consider supplements' : 'Rescreen if the condition changes'],
        text: `MNA-SF ${s} (${t.toLowerCase()})` };
    },
    ref: 'Kaiser MJ et al. J Nutr Health Aging 2009;13:782–8'
  },
  {
    id: 'braden', name: 'Braden scale (pressure ulcer risk)', cat: 'Geriatrics', specs: ['Geriatrics', 'ICU'],
    fields: [{ k: 'sen', l: 'Sensory perception', t: 'seg', opts: [['1', 'None'], ['2', 'Very limited'], ['3', 'Slightly limited'], ['4', 'Normal']] },
      { k: 'moi', l: 'Moisture', t: 'seg', opts: [['1', 'Always wet'], ['2', 'Often'], ['3', 'Sometimes'], ['4', 'Rarely']] },
      { k: 'act', l: 'Activity', t: 'seg', opts: [['1', 'Bed-bound'], ['2', 'Chair'], ['3', 'Walks a little'], ['4', 'Walks often']] },
      { k: 'mob', l: 'Mobility', t: 'seg', opts: [['1', 'Immobile'], ['2', 'Very limited'], ['3', 'Slightly limited'], ['4', 'Normal']] },
      { k: 'nut', l: 'Nutrition', t: 'seg', opts: [['1', 'Very poor'], ['2', 'Inadequate'], ['3', 'Adequate'], ['4', 'Excellent']] },
      { k: 'fri', l: 'Friction and shear', t: 'seg', opts: [['1', 'Problem'], ['2', 'Potential problem'], ['3', 'No problem']] }],
    calc: v => {
      const ks = ['sen', 'moi', 'act', 'mob', 'nut', 'fri'];
      if (!ks.every(k => has(v[k]))) return null;
      const s = ks.reduce((a, k) => a + Number(v[k]), 0);
      const t = s <= 9 ? 'Very high risk' : s <= 12 ? 'High risk' : s <= 14 ? 'Moderate risk' : s <= 18 ? 'Mild risk' : 'Low risk';
      return { main: `Braden ${s}/23 — ${t}`, level: s <= 12 ? 'high' : s <= 18 ? 'warn' : 'ok',
        lines: [s <= 18 ? 'Pressure-relieving mattress, turn every 2 h, skin checks each shift, manage moisture, nutrition review' : 'Routine skin checks'],
        text: `Braden ${s} (${t.toLowerCase()})` };
    },
    ref: 'Bergstrom N et al. Nurs Res 1987;36:205–10'
  },
  // ===================== Neurology =====================
  {
    id: 'nihss', name: 'NIH Stroke Scale (NIHSS)', cat: 'Neurology', specs: ['Neurology', 'ICU'],
    fields: [
      { k: 'n1a', l: '1a. Level of consciousness', t: 'sel', opts: [['0', '0 — Alert'], ['1', '1 — Arousable by minor stimulation'], ['2', '2 — Needs repeated or painful stimulation'], ['3', '3 — Unresponsive or reflex responses only']] },
      { k: 'n1b', l: '1b. Questions: month and age', t: 'sel', opts: [['0', '0 — Both correct'], ['1', '1 — One correct'], ['2', '2 — Neither correct']] },
      { k: 'n1c', l: '1c. Commands: open/close eyes, grip/release', t: 'sel', opts: [['0', '0 — Both performed'], ['1', '1 — One performed'], ['2', '2 — Neither performed']] },
      { k: 'n2', l: '2. Best gaze', t: 'sel', opts: [['0', '0 — Normal'], ['1', '1 — Partial gaze palsy'], ['2', '2 — Forced deviation']] },
      { k: 'n3', l: '3. Visual fields', t: 'sel', opts: [['0', '0 — No visual loss'], ['1', '1 — Partial hemianopia'], ['2', '2 — Complete hemianopia'], ['3', '3 — Bilateral hemianopia (blind)']] },
      { k: 'n4', l: '4. Facial palsy', t: 'sel', opts: [['0', '0 — Normal'], ['1', '1 — Minor'], ['2', '2 — Partial (lower face)'], ['3', '3 — Complete (upper and lower)']] },
      { k: 'n5a', l: '5a. Motor — left arm (10 s)', t: 'sel', opts: [['0', '0 — No drift'], ['1', '1 — Drift'], ['2', '2 — Some effort against gravity'], ['3', '3 — No effort against gravity'], ['4', '4 — No movement']] },
      { k: 'n5b', l: '5b. Motor — right arm (10 s)', t: 'sel', opts: [['0', '0 — No drift'], ['1', '1 — Drift'], ['2', '2 — Some effort against gravity'], ['3', '3 — No effort against gravity'], ['4', '4 — No movement']] },
      { k: 'n6a', l: '6a. Motor — left leg (5 s)', t: 'sel', opts: [['0', '0 — No drift'], ['1', '1 — Drift'], ['2', '2 — Some effort against gravity'], ['3', '3 — No effort against gravity'], ['4', '4 — No movement']] },
      { k: 'n6b', l: '6b. Motor — right leg (5 s)', t: 'sel', opts: [['0', '0 — No drift'], ['1', '1 — Drift'], ['2', '2 — Some effort against gravity'], ['3', '3 — No effort against gravity'], ['4', '4 — No movement']] },
      { k: 'n7', l: '7. Limb ataxia', t: 'sel', opts: [['0', '0 — Absent'], ['1', '1 — Present in one limb'], ['2', '2 — Present in two limbs']] },
      { k: 'n8', l: '8. Sensory', t: 'sel', opts: [['0', '0 — Normal'], ['1', '1 — Mild to moderate loss'], ['2', '2 — Severe or total loss']] },
      { k: 'n9', l: '9. Best language', t: 'sel', opts: [['0', '0 — No aphasia'], ['1', '1 — Mild to moderate aphasia'], ['2', '2 — Severe aphasia'], ['3', '3 — Mute or global aphasia']] },
      { k: 'n10', l: '10. Dysarthria', t: 'sel', opts: [['0', '0 — Normal'], ['1', '1 — Mild to moderate'], ['2', '2 — Severe (unintelligible or mute)']] },
      { k: 'n11', l: '11. Extinction / inattention', t: 'sel', opts: [['0', '0 — None'], ['1', '1 — In one sensory modality'], ['2', '2 — Profound, or in more than one modality']] }],
    calc: v => {
      const ks = ['n1a', 'n1b', 'n1c', 'n2', 'n3', 'n4', 'n5a', 'n5b', 'n6a', 'n6b', 'n7', 'n8', 'n9', 'n10', 'n11'];
      const done = ks.filter(k => has(v[k]));
      if (!done.length) return null;
      const s = done.reduce((a, k) => a + Number(v[k]), 0), left = ks.length - done.length;
      const t = s === 0 ? 'No measurable stroke deficit' : s <= 4 ? 'Minor stroke' : s <= 15 ? 'Moderate stroke' : s <= 20 ? 'Moderate to severe stroke' : 'Severe stroke';
      return { main: `NIHSS ${s}${left ? ` (${left} item${left > 1 ? 's' : ''} not scored)` : ''}`, level: s >= 16 ? 'high' : s >= 5 ? 'warn' : 'ok',
        lines: [t, 'Bands: 0 none, 1–4 minor, 5–15 moderate, 16–20 moderate to severe, 21–42 severe', 'Score what the patient does on first attempt; amputated limb scores 0 (note it)'],
        text: `NIHSS ${s}${left ? ` (incomplete, ${left} not scored)` : ''} — ${t.toLowerCase()}` };
    },
    ref: 'Brott T et al. Stroke 1989;20:864–70; NIH Stroke Scale'
  },
  {
    id: 'abcd2', name: 'ABCD² score (after TIA)', cat: 'Neurology', specs: ['Neurology', 'Cardiology'],
    fields: [{ k: 'age', l: 'Age 60 or over', t: 'chk', pts: 1, pre: P => has(P.age) ? P.age >= 60 : null },
      { k: 'bp', l: 'BP ≥140/90 at first assessment', t: 'chk', pts: 1, pre: P => { const x = P.vit('sbp'), y = P.vit('dbp'); return x || y ? { v: (x && x.v >= 140) || (y && y.v >= 90), src: (x || y).src } : null; } },
      { k: 'cl', l: 'Clinical features', t: 'seg', opts: [['2', 'One-sided weakness'], ['1', 'Speech problem only'], ['0', 'Other']] },
      { k: 'dur', l: 'Duration of symptoms', t: 'seg', opts: [['2', '≥60 min'], ['1', '10–59 min'], ['0', '<10 min']] },
      { k: 'dm', l: 'Diabetes', t: 'chk', pts: 1, pre: P => P.has('DM1', 'DM2', /^Diabetes(?! – gestational)/) }],
    calc: v => {
      if (!has(v.cl) || !has(v.dur)) return null;
      const s = (v.age ? 1 : 0) + (v.bp ? 1 : 0) + Number(v.cl) + Number(v.dur) + (v.dm ? 1 : 0);
      const r = s <= 3 ? 'Low (≈1% stroke risk at 2 days)' : s <= 5 ? 'Moderate (≈4% at 2 days)' : 'High (≈8% at 2 days)';
      return { main: `ABCD² ${s}/7`, level: s >= 6 ? 'high' : s >= 4 ? 'warn' : 'ok',
        lines: [r, 'Current guidelines advise specialist assessment within 24 h for every suspected TIA, whatever the score'],
        text: `ABCD² ${s} — ${r.split(' (')[0].toLowerCase()} risk` };
    },
    ref: 'Johnston SC et al. Lancet 2007;369:283–92; NICE NG128 (2019)'
  },
  {
    id: 'ichscore', name: 'ICH score (intracerebral hemorrhage)', cat: 'Neurology', specs: ['Neurology', 'ICU'],
    fields: [{ k: 'gcs', l: 'GCS', t: 'seg', opts: [['0', '13–15'], ['1', '5–12'], ['2', '3–4']] },
      { k: 'vol', l: 'Hematoma volume ≥30 mL (A×B×C/2)', t: 'chk', pts: 1 },
      { k: 'ivh', l: 'Intraventricular extension', t: 'chk', pts: 1 },
      { k: 'inf', l: 'Infratentorial origin', t: 'chk', pts: 1 },
      { k: 'age', l: 'Age 80 or over', t: 'chk', pts: 1, pre: P => has(P.age) ? P.age >= 80 : null }],
    calc: v => {
      if (!has(v.gcs)) return null;
      const s = Number(v.gcs) + (v.vol ? 1 : 0) + (v.ivh ? 1 : 0) + (v.inf ? 1 : 0) + (v.age ? 1 : 0);
      const m = ['0%', '13%', '26%', '72%', '97%', '100%', '≈100%'][s];
      return { main: `ICH score ${s}/6`, level: s >= 3 ? 'high' : s >= 1 ? 'warn' : 'ok',
        lines: [`30-day mortality in the original cohort: ${m}`, 'Do not use the score alone to limit treatment'],
        text: `ICH score ${s} (30-day mortality ${m} in the derivation cohort)` };
    },
    ref: 'Hemphill JC et al. Stroke 2001;32:891–7'
  },
  {
    id: 'mrs', name: 'Modified Rankin Scale', cat: 'Neurology', specs: ['Neurology', 'Geriatrics'],
    fields: [{ k: 'm', l: 'Best description', t: 'sel', opts: [['0', '0 — No symptoms'], ['1', '1 — Symptoms, but carries out all usual activities'],
      ['2', '2 — Slight disability: looks after own affairs, cannot do all previous activities'], ['3', '3 — Moderate disability: needs some help, walks unassisted'],
      ['4', '4 — Moderately severe: cannot walk or attend to bodily needs without help'], ['5', '5 — Severe: bedridden, incontinent, needs constant care'], ['6', '6 — Dead']] }],
    calc: v => {
      if (!has(v.m)) return null;
      const m = Number(v.m), d = ['no symptoms', 'no significant disability', 'slight disability', 'moderate disability', 'moderately severe disability', 'severe disability', 'dead'][m];
      return { main: `mRS ${m}`, level: m >= 4 ? 'high' : m >= 2 ? 'warn' : 'ok', lines: [d.charAt(0).toUpperCase() + d.slice(1), 'Record pre-stroke mRS too — it guides thrombolysis and thrombectomy decisions'], text: `mRS ${m} (${d})` };
    },
    ref: 'van Swieten JC et al. Stroke 1988;19:604–7'
  },
  // ===================== Infection =====================
  {
    id: 'duke', name: 'Modified Duke criteria (endocarditis)', cat: 'Infection', specs: ['Infectious Diseases', 'Cardiology'],
    fields: [{ k: 'bc', l: 'MAJOR: typical organism in 2 separate blood cultures, or persistently positive cultures', t: 'chk' },
      { k: 'cox', l: 'MAJOR: Coxiella burnetii culture, or phase I IgG >1:800', t: 'chk' },
      { k: 'echo', l: 'MAJOR: echo shows vegetation, abscess or new prosthetic valve dehiscence', t: 'chk' },
      { k: 'reg', l: 'MAJOR: new valvular regurgitation', t: 'chk' },
      { k: 'pred', l: 'Minor: predisposing heart condition or injection drug use', t: 'chk', pre: P => P.has('Prosthetic heart valve', 'Valvular heart disease', 'Injection drug use') || null },
      { k: 'fev', l: 'Minor: fever ≥38 °C', t: 'chk' },
      { k: 'vasc', l: 'Minor: vascular signs (emboli, septic lung infarcts, mycotic aneurysm, intracranial or conjunctival bleed, Janeway lesions)', t: 'chk' },
      { k: 'imm', l: 'Minor: immunologic signs (glomerulonephritis, Osler nodes, Roth spots, rheumatoid factor)', t: 'chk' },
      { k: 'mic', l: 'Minor: positive blood culture not meeting a major criterion', t: 'chk' }],
    calc: v => {
      const maj = (v.bc || v.cox ? 1 : 0) + (v.echo || v.reg ? 1 : 0);
      const min = ['pred', 'fev', 'vasc', 'imm', 'mic'].filter(k => v[k]).length;
      if (!maj && !min) return null;
      const def = maj === 2 || (maj === 1 && min >= 3) || min === 5;
      const pos = !def && ((maj === 1 && min >= 1) || min >= 3);
      const c = def ? 'Definite endocarditis' : pos ? 'Possible endocarditis' : 'Criteria not met';
      return { main: `${c} (${maj} major, ${min} minor)`, level: def ? 'high' : pos ? 'warn' : 'ok',
        lines: ['Definite: 2 major, or 1 major + 3 minor, or 5 minor. Possible: 1 major + 1 minor, or 3 minor',
          'The 2023 Duke-ISCVID update adds cardiac CT, PET-CT, PCR and more organisms — use it where available'],
        text: `Modified Duke: ${c.toLowerCase()} (${maj} major, ${min} minor)` };
    },
    ref: 'Li JS et al. Clin Infect Dis 2000;30:633–8; Fowler VG et al. Clin Infect Dis 2023 (Duke-ISCVID)'
  },
  {
    id: 'sofa2', name: 'SOFA-2 score (2025)', cat: 'Infection', specs: ['ICU', 'Infectious Diseases'],
    fields: [{ k: 'gcs', l: 'GCS', u: '3–15' },
      { k: 'delir', l: 'Drugs given to treat delirium', t: 'chk' },
      LAB('pao2', 'PaO₂', 'mmHg', 'pO2'), LAB('fio2', 'FiO₂', '%', 'FiO2'),
      { k: 'spo2', l: 'SpO₂ (if no PaO₂)', u: '%' },
      { k: 'avs', l: 'Advanced ventilatory support (HFNC, CPAP, BiPAP/NIV, invasive ventilation)', t: 'chk' },
      { k: 'ecmo', l: 'ECMO for respiratory failure', t: 'chk' },
      { k: 'cv', l: 'Circulation', t: 'sel', opts: [['0', 'MAP ≥70, no vasopressor'], ['1', 'MAP <70, no vasopressor'],
        ['2', 'Noradrenaline + adrenaline ≤0.2 µg/kg/min, or any other vasopressor/inotrope'],
        ['3', 'Noradrenaline + adrenaline >0.2–0.4, or low dose plus another agent'],
        ['4', 'Noradrenaline + adrenaline >0.4, or medium dose plus another agent, or mechanical support (VA-ECMO, IABP, LVAD)']] },
      LAB('bili', 'Total bilirubin', 'mg/dL', 'T.Bil'), LAB('plt', 'Platelets', '×10³/µL', 'Plt'), LAB('cr', 'Creatinine', 'mg/dL', 'Cr'),
      { k: 'uo', l: 'Urine output', t: 'sel', opts: [['0', 'Normal or not measured'], ['1', '<0.5 mL/kg/h for 6–12 h'], ['2', '<0.5 mL/kg/h for ≥12 h'], ['3', '<0.3 mL/kg/h ≥24 h, or anuria ≥12 h']] },
      { k: 'rrt', l: 'On dialysis or meets criteria for it (includes chronic dialysis)', t: 'chk', pre: P => P.has('ESKD on HD', 'ESKD on PD', 'AKI – on dialysis (RRT)') || null }],
    calc: v => {
      const parts = [], miss = [];
      let brain = null;
      if (has(v.gcs)) brain = v.gcs >= 15 ? 0 : v.gcs >= 13 ? 1 : v.gcs >= 9 ? 2 : v.gcs >= 6 ? 3 : 4;
      if (v.delir) brain = Math.max(brain || 0, 1);
      let resp = null, supp = v.avs || v.ecmo;
      const fi = has(v.fio2) ? (v.fio2 > 1 ? v.fio2 / 100 : v.fio2) : null;
      if (fi && has(v.pao2)) { const r = v.pao2 / fi; resp = r > 300 ? 0 : r > 225 ? 1 : r > 150 ? 2 : r > 75 ? (supp ? 3 : 2) : (supp ? 4 : 2); parts.push(`P/F ${r0(r)}`); }
      else if (fi && has(v.spo2) && v.spo2 < 98) { const r = v.spo2 / fi; resp = r > 300 ? 0 : r > 250 ? 1 : r > 200 ? 2 : r > 120 ? (supp ? 3 : 2) : (supp ? 4 : 2); parts.push(`S/F ${r0(r)}`); }
      if (v.ecmo) resp = 4;
      const cv = has(v.cv) ? Number(v.cv) : null;
      const liver = has(v.bili) ? (v.bili <= 1.2 ? 0 : v.bili <= 3 ? 1 : v.bili <= 6 ? 2 : v.bili <= 12 ? 3 : 4) : null;
      const hemo = has(v.plt) ? (v.plt > 150 ? 0 : v.plt > 100 ? 1 : v.plt > 80 ? 2 : v.plt > 50 ? 3 : 4) : null;
      let kid = has(v.cr) ? (v.cr <= 1.2 ? 0 : v.cr <= 2 ? 1 : v.cr <= 3.5 ? 2 : 3) : null;
      if (has(v.uo)) kid = Math.max(kid || 0, Number(v.uo));
      if (v.rrt) kid = 4;
      const sys = [['Brain', brain], ['Respiratory', resp], ['Cardiovascular', cv], ['Liver', liver], ['Kidney', kid], ['Hemostasis', hemo]];
      if (sys.every(([, x]) => x === null)) return null;
      sys.forEach(([n, x]) => { if (x === null) miss.push(n); });
      const tot = sys.reduce((a, [, x]) => a + (x || 0), 0);
      const lines = [sys.filter(([, x]) => x !== null).map(([n, x]) => `${n} ${x}`).join(' · ') + (parts.length ? ` (${parts.join(', ')})` : '')];
      if (miss.length) lines.push(`Not scored: ${miss.join(', ')}`);
      if (resp === 2 && !supp && ((fi && has(v.pao2) && v.pao2 / fi <= 150) || (fi && has(v.spo2) && v.spo2 / fi <= 200))) lines.push('Respiratory capped at 2 without advanced ventilatory support');
      lines.push('Use the worst value of each system in the past 24 h. Sepsis = suspected infection with an acute rise of ≥2 points');
      return { main: `SOFA-2 ${tot}/24${miss.length ? ' (incomplete)' : ''}`, level: tot >= 8 ? 'high' : tot >= 2 ? 'warn' : 'ok', lines,
        text: `SOFA-2 ${tot}${miss.length ? ` (not scored: ${miss.join(', ')})` : ''}` };
    },
    ref: 'Ranzani OT et al. JAMA 2025;334:2090–2103 (SOFA-2); Singer M et al. JAMA 2016;315:801–10 (Sepsis-3)'
  },
  // ===================== Body size =====================
  {
    id: 'bmi', name: 'Body mass index', cat: 'Body size', specs: ['Endocrine', 'Cardiology', 'Pulmonary', 'Rheumatology', 'Gastroenterology', 'Oncology', 'Nephrology', 'Geriatrics'],
    fields: [WT, HT],
    calc: v => {
      if (![v.wt, v.ht].every(has) || v.ht <= 0) return null;
      const b = v.wt / Math.pow(v.ht / 100, 2);
      const t = b < 18.5 ? 'Underweight' : b < 25 ? 'Normal weight' : b < 30 ? 'Overweight' : b < 35 ? 'Obesity class I' : b < 40 ? 'Obesity class II' : 'Obesity class III';
      return { main: `BMI ${r1(b)} kg/m²`, level: b >= 30 || b < 18.5 ? 'warn' : 'ok', lines: [t], text: `BMI ${r1(b)} (${t.toLowerCase()})` };
    },
    ref: 'WHO BMI classification'
  },
  {
    id: 'bsa', name: 'Body surface area (Mosteller)', cat: 'Body size', specs: ['Hematology', 'Oncology'],
    fields: [WT, HT],
    calc: v => {
      if (![v.wt, v.ht].every(has)) return null;
      const s = Math.sqrt(v.wt * v.ht / 3600);
      return { main: `BSA ${r2(s)} m²`, level: 'ok', lines: ['Used for chemotherapy dosing — check the protocol'], text: `BSA ${r2(s)} m²` };
    },
    ref: 'Mosteller RD. N Engl J Med 1987;317:1098'
  }
];
