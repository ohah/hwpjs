// Bounded CSV syntax only. Callers own schemas and UTF-8 decoding.
export function parseCsv(text,{maxChars=4*1024*1024,maxRows=100000,maxColumns=32,maxFieldChars=1024*1024}={}){
  if(typeof text!=='string')throw Error('InvalidCsvInput');
  for(const n of [maxChars,maxRows,maxColumns,maxFieldChars])if(!Number.isSafeInteger(n)||n<0)throw Error('InvalidCsvLimit');
  if(text.length>maxChars)throw Error('CsvLimitExceeded');
  if(text.startsWith('\ufeff'))text=text.slice(1);
  const rows=[];let row=[],field='',state='start',active=false;
  function append(c){if(field.length+c.length>maxFieldChars)throw Error('CsvLimitExceeded');field+=c;}
  function column(){if(row.length>=maxColumns)throw Error('CsvLimitExceeded');row.push(field);field='';state='start';}
  function line(){column();if(rows.length>=maxRows)throw Error('CsvLimitExceeded');rows.push(row);row=[];active=false;}
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='\0')throw Error('InvalidCsvNul');active=true;
    if(state==='quoted'){if(c==='"')state='after_quote';else append(c);continue;}
    if(state==='after_quote'&&c==='"'){append('"');state='quoted';continue;}
    if(c===','){column();continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'){if(text[i+1]!=='\n')throw Error('InvalidCsvLineEnding');i++;}line();continue;}
    if(state==='after_quote')throw Error('InvalidCsvQuoteSuffix');
    if(c==='"'){if(state!=='start')throw Error('InvalidCsvQuote');state='quoted';continue;}
    append(c);state='bare';
  }
  if(state==='quoted')throw Error('UnterminatedCsvQuote');
  if(active)line();return rows;
}
