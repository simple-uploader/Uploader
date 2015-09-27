var pkg = require('./package.json')
var gulp = require('gulp')
var eslint = require('gulp-eslint')
var browserify = require('gulp-browserify')
var header = require('gulp-header')
var uglify = require('gulp-uglify')
var concat = require('gulp-concat')
var sourcemaps = require('gulp-sourcemaps')

var name = 'uploader'
var NAME = name.charAt(0).toUpperCase() + name.substr(1)
var fname = name + '.js'
var mname = name + '.min.js'

var paths = {
	src: 'src/',
	dist: 'dist/'
}
var allFiles = paths.src + '*.js'
var banner = [
	'/*!',
	' * ' + NAME + ' - <%= pkg.description %>',
	' * @version v<%= pkg.version %>',
	' * @author <%= pkg.author %>',
	' * @link <%= pkg.homepage %>',
	' * @license <%= pkg.license %>',
	' */',
	''
].join('\n')

gulp.task('eslint', function () {
	return gulp.src(allFiles)
		.pipe(eslint({
			useEslintrc: true
		}))
		.pipe(eslint.format())
		.pipe(eslint.failOnError())
})

gulp.task('scripts', ['eslint'], function() {
	return gulp.src(paths.src + fname)
		.pipe(browserify({
			debug: false,
			standalone: 'Uploader',
			transform: ['browserify-versionify']
		}))
		.pipe(header(banner, {
			pkg: pkg
		}))
		.pipe(gulp.dest(paths.dist))
});

gulp.task('miniScripts', ['scripts'], function () {
	return gulp.src(paths.dist + fname)
		.pipe(sourcemaps.init())
		.pipe(uglify({
			preserveComments: 'license'
		}))
		.pipe(concat(mname))
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest(paths.dist))
})

gulp.task('watch', function() {
	gulp.watch(allFiles, ['scripts']);
});

gulp.task('default', ['miniScripts'])
