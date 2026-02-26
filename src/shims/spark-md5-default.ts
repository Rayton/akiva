import * as SparkMD5Namespace from 'spark-md5/spark-md5.js';

const SparkMD5 = (SparkMD5Namespace as { default?: unknown }).default ?? SparkMD5Namespace;

export default SparkMD5;
