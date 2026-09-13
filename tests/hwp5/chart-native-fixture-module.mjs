import {createHash} from 'node:crypto';
export function observedFixtureModule(bytes,pointCounts){
 const b=Buffer.from(bytes);
 if(b.length===0||b.length>1024*1024)throw Error('InvalidFixtureSize');
 if(!Array.isArray(pointCounts)||pointCounts.length===0||pointCounts.length>16||!Array.from(pointCounts).every(n=>Number.isInteger(n)&&n>=0&&n<=65535))throw Error('InvalidFixtureCounts');
 const hex=b.toString('hex'),escaped=hex.replace(/../g,p=>'\\x'+p);
 return 'pub const bytes = "'+escaped+'";\n' +
  'pub const point_counts = [_]usize{'+pointCounts.join(',')+'};\n' +
  'pub const primary_axis_count: usize = 4;\n' +
  'pub const line_item_count: usize = 2;\n' +
  'pub const sha256 = "'+createHash('sha256').update(b).digest('hex')+'";\n';
}
