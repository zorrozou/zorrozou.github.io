# Linux的TCP实现之：慢启动

-------------------------------------------------------------------------------------

版权声明：

本文章内容在非商业使用前提下可无需授权任意转载、发布。

转载、发布请务必注明作者和其微博、微信公众号地址，以便读者询问问题和甄误反馈，共同进步。

微博：
[https://weibo.com/orroz/](https://weibo.com/orroz)

博客：
[https://zorrozou.github.io/](https://zorrozou.github.io/)

微信公众号：**Linux系统技术**

-------------------------------------------------------------------------------------

## 前言

TCP的慢启动过程在不少场景下会严重影响性能，这也是TCP性能饱受病垢的原因之一。我们在本文中将尽量详细的描述慢启动过程和其在不同场景下的性能影响。

## 什么是慢启动？

很抱歉，本文不打算从理论上描述什么是慢启动，以及为什么要慢启动？相信这些最基础的知识大家都能很方便的找到答案，如果你真的找不到的话，那我推荐《TCP/IP详解：卷一》来参考。在补充了这些基础之后，我们不如直接来看一个慢启动的例子，然后通过实际情况来看一下慢启动的过程。

实验环境是我本地跑的两个虚拟机，它们分别是fedora31和centos8，内核版本分别为5.5和4.18。为了能更体现出慢启动的效果，我们分别在两个服务器上人为添加了一点延时：

```
[root@localhost zorro]# tc qd add dev ens33 root netem delay 3ms
[root@localhost zorro]# uname -r
5.5.15-200.fc31.x86_64
```

```
[root@localhost zorro]# tc qd add dev ens33 root netem delay 3ms
[root@localhost zorro]# uname -r
4.18.0-147.8.1.el8_1.x86_64
```

两台服务器都加了3ms的发包延时，这将导致两台服务器之间的rtt时间达到6-7ms左右，我们来验证一下：

```
[root@localhost zorro]# ping -c 1000 -f 192.168.247.129
PING 192.168.247.129 (192.168.247.129) 56(84) bytes of data.

--- 192.168.247.129 ping statistics ---
1000 packets transmitted, 1000 received, 0% packet loss, time 7198ms
rtt min/avg/max/mdev = 6.245/7.152/7.561/0.268 ms, ipg/ewma 7.205/7.216 ms
```

测试环境依然使用web服务，我们在192.168.247.129上启动一个httpd，在80端口监听。在192.168.247.130上使用wget作为客户端访问服务器。在web服务器上，我们准备了一个512k大小的数据来供测试访问，先测试一下：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/sfile
--2020-05-27 10:44:25--  http://192.168.247.129/sfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 524288 (512K)
Saving to: 'sfile'

sfile                     100%[=====================================>] 512.00K  --.-KB/s    in 0.04s

2020-05-27 10:44:25 (13.8 MB/s) - 'sfile' saved [524288/524288]

```

以上就是整体环境了。之后我们重复下载这个数据，并且在192.168.247.129上抓包查看传输细节。为了方便描述整个过程，我们直接在抓包的代码中穿插描述相关行为：

```
[root@localhost html]# tcpdump -i ens33 -nn port 80
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
10:45:49.051409 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [S], seq 2185246534, win 64240, options [mss 1460,sackOK,TS val 997937981 ecr 0,nop,wscale 7], length 0
10:45:49.054995 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [S.], seq 1670507718, ack 2185246535, win 28960, options [mss 1460,sackOK,TS val 295305494 ecr 997937981,nop,wscale 7], length 0
10:45:49.058267 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 1, win 502, options [nop,nop,TS val 997937987 ecr 295305494], length 0

#至此，三次握手结束。

10:45:49.058416 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [P.], seq 1:148, ack 1, win 502, options [nop,nop,TS val 997937988 ecr 295305494], length 147: HTTP: GET /sfile HTTP/1.1

#客户端发送http请求：GET /sfile

10:45:49.061641 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 0

#服务端对上个请求进行ack确认应答。之后开始发送数据。

10:45:49.061748 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 1:2897, ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 2896: HTTP: HTTP/1.1 200 OK
10:45:49.061788 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 2897:5793, ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 2896: HTTP
10:45:49.061789 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 5793:8689, ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 2896: HTTP
10:45:49.061789 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 8689:11585, ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 2896: HTTP
10:45:49.061790 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 11585:14481, ack 148, win 235, options [nop,nop,TS val 295305501 ecr 997937988], length 2896: HTTP

#第一次中断发送
#数据发送过程到这里要中断一下。我们发现，此时数据没有发送完，发到了14481字节处，但是服务端停止了发送。此时纪录的时间是10:45:49.061790。下一个数据发送在10:45:49.068914秒处。并且中间在10:45:49.065490秒处收到一个客户端发来的ack确认包，确认到14481字节收取完毕。

10:45:49.065490 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 14481, win 436, options [nop,nop,TS val 997937994 ecr 295305501], length 0

#ack确认到14481，之后继续发后续数据。

10:45:49.068914 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 14481:21721, ack 148, win 235, options [nop,nop,TS val 295305508 ecr 997937994], length 7240: HTTP
10:45:49.068936 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 21721:28961, ack 148, win 235, options [nop,nop,TS val 295305508 ecr 997937994], length 7240: HTTP
10:45:49.068938 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 28961:36201, ack 148, win 235, options [nop,nop,TS val 295305508 ecr 997937994], length 7240: HTTP
10:45:49.068940 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 36201:43441, ack 148, win 235, options [nop,nop,TS val 295305508 ecr 997937994], length 7240: HTTP

#第二次中断发送。

10:45:49.072737 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 43441, win 360, options [nop,nop,TS val 997938001 ecr 295305508], length 0

#ack确认。之后继续发送。

10:45:49.076090 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 43441:46337, ack 148, win 235, options [nop,nop,TS val 295305516 ecr 997938001], length 2896: HTTP
10:45:49.076111 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 46337:62265, ack 148, win 235, options [nop,nop,TS val 295305516 ecr 997938001], length 15928: HTTP
10:45:49.076114 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 62265:78193, ack 148, win 235, options [nop,nop,TS val 295305516 ecr 997938001], length 15928: HTTP
10:45:49.076116 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 78193:89521, ack 148, win 235, options [nop,nop,TS val 295305516 ecr 997938001], length 11328: HTTP

#第三次中断发送。

10:45:49.079500 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 78193, win 978, options [nop,nop,TS val 997938009 ecr 295305516], length 0
10:45:49.079541 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 89521, win 917, options [nop,nop,TS val 997938009 ecr 295305516], length 0

#ack确认到89521，继续发送。

10:45:49.082806 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 89521:114137, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 24616: HTTP
10:45:49.082826 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 114137:121377, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 7240: HTTP
10:45:49.082829 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 121377:145993, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 24616: HTTP
10:45:49.082831 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 145993:153233, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 7240: HTTP
10:45:49.082836 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 153233:182193, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 28960: HTTP
10:45:49.082837 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 182193:185089, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 2896: HTTP
10:45:49.082838 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 185089:193777, ack 148, win 235, options [nop,nop,TS val 295305522 ecr 997938009], length 8688: HTTP

#第四次中断发送。

10:45:49.086231 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 114137, win 1031, options [nop,nop,TS val 997938015 ecr 295305522], length 0
10:45:49.086327 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 121377, win 993, options [nop,nop,TS val 997938015 ecr 295305522], length 0
10:45:49.086353 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 167713, win 751, options [nop,nop,TS val 997938015 ecr 295305522], length 0
10:45:49.086361 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 185089, win 660, options [nop,nop,TS val 997938015 ecr 295305522], length 0
10:45:49.086364 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 193777, win 615, options [nop,nop,TS val 997938015 ecr 295305522], length 0

#ack确认到193777，之后继续发送数据。

10:45:49.089786 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 193777:216945, ack 148, win 235, options [nop,nop,TS val 295305529 ecr 997938015], length 23168: HTTP
10:45:49.089807 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 216945:248801, ack 148, win 235, options [nop,nop,TS val 295305529 ecr 997938015], length 31856: HTTP
10:45:49.089811 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 248801:272497, ack 148, win 235, options [nop,nop,TS val 295305529 ecr 997938015], length 23696: HTTP

#第五次中断发送。

10:45:49.093394 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 248801, win 1891, options [nop,nop,TS val 997938022 ecr 295305529], length 0
10:45:49.093436 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 272497, win 2261, options [nop,nop,TS val 997938022 ecr 295305529], length 0

#ack确认到272497，继续发送。

10:45:49.096969 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 272497:280657, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 8160: HTTP
10:45:49.096991 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 280657:312513, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 31856: HTTP
10:45:49.096995 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 312513:344369, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 31856: HTTP
10:45:49.097005 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 344369:402289, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 57920: HTTP
10:45:49.097006 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 402289:406633, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 4344: HTTP
10:45:49.097017 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 406633:468897, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 62264: HTTP
10:45:49.097024 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 468897:505097, ack 148, win 235, options [nop,nop,TS val 295305536 ecr 997938022], length 36200: HTTP

#第六次中断发送。

10:45:49.100695 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 280657, win 2389, options [nop,nop,TS val 997938029 ecr 295305536], length 0
10:45:49.100735 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 312513, win 2674, options [nop,nop,TS val 997938029 ecr 295305536], length 0
10:45:49.100739 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 344369, win 2507, options [nop,nop,TS val 997938029 ecr 295305536], length 0
10:45:49.100744 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 406633, win 2182, options [nop,nop,TS val 997938030 ecr 295305536], length 0
10:45:49.100746 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 468897, win 1856, options [nop,nop,TS val 997938030 ecr 295305536], length 0
10:45:49.100753 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 505097, win 1667, options [nop,nop,TS val 997938030 ecr 295305536], length 0

#ack确认到505097之后继续发送。

10:45:49.104304 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [.], seq 505097:522473, ack 148, win 235, options [nop,nop,TS val 295305543 ecr 997938029], length 17376: HTTP
10:45:49.104320 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [P.], seq 522473:524584, ack 148, win 235, options [nop,nop,TS val 295305543 ecr 997938029], length 2111: HTTP

#数据发完。之后确认，并结束tcp连接过程。

10:45:49.107580 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 524584, win 2979, options [nop,nop,TS val 997938037 ecr 295305543], length 0
10:45:49.108048 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [F.], seq 148, ack 524584, win 2979, options [nop,nop,TS val 997938037 ecr 295305543], length 0
10:45:49.111266 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [F.], seq 524584, ack 149, win 235, options [nop,nop,TS val 295305551 ecr 997938037], length 0
10:45:49.114472 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 524585, win 2979, options [nop,nop,TS val 997938044 ecr 295305551], length 0

^C
58 packets captured
58 packets received by filter
0 packets dropped by kernel
```

观察整个过程可知，tcp传输这512k的数据中间中断了6次，每次中断都是在等ack确认。对tcp基础知识稍有了解的话，我们应该知道这些中断都是由于滑动窗口机制导致的，每次数据会发送一个窗口的长度，然后等待确认之后再继续发后续的数据。从这几次中断的过程我们也能看到每次连续发送数据的长度依次为：

第一次：14481-1 = 14480字节

第二次：43441-14481 = 28960字节

第三次：89521-43441 = 46080字节

第四次：193777-89521 = 104256字节

第五次：272497-193777 = 78720字节

第六次：505097-272497 = 232600字节

第七次：524584-505097 = 19487字节

这就是所谓的慢启动过程，tcp每次发送大概之前窗口的一倍长度数据。在理想环境下，每次连续发送数据的长度是以2的指数倍数增长的。当窗口剩余字节数为0的时候，tcp将不在发送数据，此时要等待客户端发ack确认数据收到，然后发送端才能根据确认数据的情况来增加窗口长度持续发送。

正是由于这种慢启动加滑动窗口发送的机制，导致了一个问题，就是tcp在传输这种半大不小的数据时，在网络稍有延时增加的情况下，会体现出很大比例的延时增加。当前的512k数据的传输正好体现了这一问题，我们从抓包的角度看，整个传输过程第一个包syn收到的时间是10:45:49.051409，最后一个包ack的到达时间是10:45:49.114472，这意味着整个传输过程达到了63ms。我们对延时稍加更改，把两端延时编程1ms再试一下整个传输过程：

```
[root@localhost zorro]# tc qd del dev ens33 root netem delay 3ms
[root@localhost zorro]# tc qd add dev ens33 root netem delay 1ms
[root@localhost zorro]# ping -c 1000 -f 192.168.247.129
PING 192.168.247.129 (192.168.247.129) 56(84) bytes of data.

--- 192.168.247.129 ping statistics ---
1000 packets transmitted, 1000 received, 0% packet loss, time 2839ms
rtt min/avg/max/mdev = 2.273/2.761/3.474/0.139 ms, ipg/ewma 2.841/2.764 ms
```

```
[root@localhost html]# tcpdump -i ens33 -nn port 80
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
11:23:06.812691 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [S], seq 579914493, win 64240, options [mss 1460,sackOK,TS val 1000175743 ecr 0,nop,wscale 7], length 0
11:23:06.813795 IP 192.168.247.129.80 > 192.168.247.130.44628: Flags [S.], seq 3318459719, ack 579914494, win 28960, options [mss 1460,sackOK,TS val 297543261 ecr 1000175743,nop,wscale 7], length 0
11:23:06.815041 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [.], ack 1, win 502, options [nop,nop,TS val 1000175745 ecr 297543261], length 0
11:23:06.815102 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [P.], seq 1:148, ack 1, win 502, options [nop,nop,TS val 1000175745 ecr 297543261], length 147: HTTP: GET /sfile HTTP/1.1
......
11:23:06.849835 IP 192.168.247.129.80 > 192.168.247.130.44628: Flags [.], seq 511145:519833, ack 148, win 235, options [nop,nop,TS val 297543296 ecr 1000175779], length 8688: HTTP
11:23:06.851098 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [.], ack 519833, win 4032, options [nop,nop,TS val 1000175781 ecr 297543296], length 0
11:23:06.852256 IP 192.168.247.129.80 > 192.168.247.130.44628: Flags [P.], seq 519833:524584, ack 148, win 235, options [nop,nop,TS val 297543299 ecr 1000175781], length 4751: HTTP
11:23:06.853573 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [.], ack 524584, win 4106, options [nop,nop,TS val 1000175784 ecr 297543299], length 0
11:23:06.853968 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [F.], seq 148, ack 524584, win 4106, options [nop,nop,TS val 1000175784 ecr 297543299], length 0
11:23:06.855121 IP 192.168.247.129.80 > 192.168.247.130.44628: Flags [F.], seq 524584, ack 149, win 235, options [nop,nop,TS val 297543302 ecr 1000175784], length 0
11:23:06.856375 IP 192.168.247.130.44628 > 192.168.247.129.80: Flags [.], ack 524585, win 4106, options [nop,nop,TS val 1000175787 ecr 297543302], length 0


^C
84 packets captured
84 packets received by filter
0 packets dropped by kernel
```

此时传输同样大小的数据的时间下降到了大概44ms。如果我们完全去除延时的影响呢？在我这个环境上进行测量，整个发送过程只需要8ms左右。此时两台虚拟机的rtt时间大概在0.3ms左右：

```
[root@localhost zorro]# ping -c 1000 -f 192.168.247.129
PING 192.168.247.129 (192.168.247.129) 56(84) bytes of data.

--- 192.168.247.129 ping statistics ---
1000 packets transmitted, 1000 received, 0% packet loss, time 422ms
rtt min/avg/max/mdev = 0.099/0.365/2.607/0.615 ms, ipg/ewma 0.422/0.164 ms
```

两端延时增加7ms，512k数据的传输过程从8ms增加到了63ms，整整55ms的差距。这也基本符合我们的理论模型，大概6次中断，每次中断等大约7ms的rtt，一共差不多就是42ms，加上建立连接和关闭连接的rtt，一个tcp连接在这个模型下增加55ms左右基本算是正常情况。

## 什么场景下会有这种问题？

根据以上问题分析，我们会发现，当一次请求的数据量比较小时，比如小到14480字节以内时，数据传输过程将在一个rtt时间内完全结束。此时网络延时的增加跟传输时间的增加一致，大概都能接受。

另外一种情况就是数据传输量很大，比如达到几百M甚至几G的情况下，因为无论如何传输时间都比较长，比如长到几十几百秒，那么慢启动过程中额外消耗的几十几百ms就几乎不可见了。此时我们也不用关心这个过程导致的延时。

但是在传输数据几百k的时候，而且又预期传输时间应该很短的场景下，那么延时的一点增加，比如从1ms增加到5ms，就可能会导致请求从之前的50ms左右的处理时间直接达到甚至超过100ms。这在很多微服务的场景下很可能是无法接受的，尤其是在云的场景下，网络可能存在跨机房甚至跨城市的迁移，加上网络虚拟化本身多加了不知道多少层的消耗，可能延时有几ms的增加，就可能导致很多服务表现出超时的情况。

所以在未来的云服务、微服务的场景下，这个问题会越来越需要被重视。那么如何解决这个问题呢？除去使用非TCP这个方案不谈，如果只局限于TCP的前提下，思路也很简单。我们发现默认情况下第一个数据发送窗口长度是14480，如果能根据情况适当增加这个窗口长度，理论上我们就可以减少很多次因为rtt导致的中断等待，进而减少整个传输的延时时间。那么这个窗口长度怎么来的呢？

## 拥塞窗口cwnd

在TCP的传输过程中，发送方一次给对方发送数据的窗口应该有多大？仔细思考一下大家应该明白，这个发送窗口的大小不能由任意一方单独决定，一个合理的值应该由双方协商，并且根据当前网络状态还会随时调整。在一个TCP连接中，双方会根据自己服务器的状态来通告自己的接受窗口长度给对方，这个值叫做rwnd。但是对于一个刚刚开始的TCP来说，可能还来不及跟对方协商窗口长度就需要发送数据，所以TCP会选择以一个比较小的发送窗口来开始数据传输，并且根据数据的发送和确认状态来动态增长这个窗口，这个一开始确定的窗口长度叫做cwnd。

我们可以从代码中看一下这个cnwd是怎么来的，一个TCP连接在创建的过程中调用tcp_init_cwnd来初始化cwnd长度：

```
__u32 tcp_init_cwnd(const struct tcp_sock *tp, const struct dst_entry *dst)
{
        __u32 cwnd = (dst ? dst_metric(dst, RTAX_INITCWND) : 0);

        if (!cwnd)
                cwnd = TCP_INIT_CWND;
        return min_t(__u32, cwnd, tp->snd_cwnd_clamp);
}
```

这个函数很简单，首先看dst_metric是否有配置一个值，没有的话就将cwnd设置为TCP_INIT_CWND，这个值在当前版本内核中定义为:

```
/* TCP initial congestion window as per rfc6928 */
#define TCP_INIT_CWND           10
```

我们当前使用的5.5版本和4.18版本都是10。但在更早版本的内核中，这个值要更小。函数最后返回cwnd和tp->snd_cwnd_clamp中最小的那个值。然后我们来说明一下这个值是如何起作用的：

```
void tcp_init_transfer(struct sock *sk, int bpf_op)
{
        struct inet_connection_sock *icsk = inet_csk(sk);
        struct tcp_sock *tp = tcp_sk(sk);

        tcp_mtup_init(sk);
        icsk->icsk_af_ops->rebuild_header(sk);
        tcp_init_metrics(sk);

        /* Initialize the congestion window to start the transfer.
         * Cut cwnd down to 1 per RFC5681 if SYN or SYN-ACK has been
         * retransmitted. In light of RFC6298 more aggressive 1sec
         * initRTO, we only reset cwnd when more than 1 SYN/SYN-ACK
         * retransmission has occurred.
         */
        if (tp->total_retrans > 1 && tp->undo_marker)
                tp->snd_cwnd = 1;
        else
                tp->snd_cwnd = tcp_init_cwnd(tp, __sk_dst_get(sk));
        tp->snd_cwnd_stamp = tcp_jiffies32;

        tcp_call_bpf(sk, bpf_op, 0, NULL);
        tcp_init_congestion_control(sk);
        tcp_init_buffer_space(sk);
}
```

通过tcp_init_transfer，将tp->snd_cwnd的值设置成了tcp_init_cwnd的返回值，最后返回的将是TCP_INIT_CWND和tp->snd_cwnd_clamp值当中的较小的那个。tp->snd_cwnd_clamp在之前的tcp_init_sock过程中被设置为tp->snd_cwnd_clamp = ~0，而snd_cwnd_clamp是一个u32，所以理论上默认snd_cwnd_clamp是4G那么大。一般来讲，这里的较小值一定是TCP_INIT_CWND。通过这个方法我们还可以看到，cwnd会根据三次握手过程中的包是否有重传来改变snd_cwnd的设置，如果出现重传，则snd_cwnd被设置为1，如果没有，那么默认值将是TCP_INIT_CWND的值为10。

snd_cwnd起作用的方式也很简单，它相当于控制了发送的拥塞窗口长度，是mss的倍数。初始化时的mss一般是路径mtu减去相关ip协议和tcp协议包头的长度，而mtu一般是1500，所以这个值一般在1400以上，这就是为什么我们抓包看到的第一次等待时间发上在发送了14480字节的时候。

当然这里还有一个dst_metric返回的是什么？实际上内核给我们提供了一种修改初始化时cwnd的手段。可以使用如下命令修改initcwnd：

```
[root@localhost zorro]# ip ro sh
default via 192.168.247.2 dev ens33 proto dhcp metric 20100
192.168.122.0/24 dev virbr0 proto kernel scope link src 192.168.122.1 linkdown
192.168.247.0/24 dev ens33 proto kernel scope link src 192.168.247.130 metric 100
[root@localhost zorro]# ip ro change 192.168.247.0/24 dev ens33 proto kernel scope link src 192.168.247.130 metric 100 initcwnd 20
[root@localhost zorro]# ip ro sh
default via 192.168.247.2 dev ens33 proto dhcp metric 20100
192.168.122.0/24 dev virbr0 proto kernel scope link src 192.168.122.1 linkdown
192.168.247.0/24 dev ens33 proto kernel scope link src 192.168.247.130 metric 100 initcwnd 20 
```

initcwnd信息是存在路由信息的表中的，dst_metric就是检查这个表中是否有定义initcwnd，如果有，则以此值为cwnd。从修改方法中我们也能看出，这个值是针对路由条目的，配置的时候需要注意客户端是走的哪条路有，针对性的修改对应的路由。大多数场景下应该修改default默认路由。

通过这种手段我们可以把cwnd改的很大，来加快慢启动的处理过程。但是TCP是复杂的，决定初始化发送窗口长度的不仅仅是cwnd，还有客户端通告接受窗口长度，从三次握手的过程中我们可以观察到客户端的通告窗口长度是多少：

```
10:45:49.051409 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [S], seq 2185246534, win 64240, options [mss 1460,sackOK,TS val 997937981 ecr 0,nop,wscale 7], length 0
10:45:49.054995 IP 192.168.247.129.80 > 192.168.247.130.44612: Flags [S.], seq 1670507718, ack 2185246535, win 28960, options [mss 1460,sackOK,TS val 295305494 ecr 997937981,nop,wscale 7], length 0
10:45:49.058267 IP 192.168.247.130.44612 > 192.168.247.129.80: Flags [.], ack 1, win 502, options [nop,nop,TS val 997937987 ecr 295305494], length 0
```

第一个syn中就已经写明了，客户端的通告窗口为64240字节，所以，即使服务端把initcwnd调的再大，也不会超过这个值。

那么调整完cwnd之后会不会对上述例子中的传输过程有影响呢？我们来测试一下：

网络存在5ms延时不改initcwnd的情况：

```
[root@localhost zorro]# tcpdump -i ens33 -nn port 80
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
11:23:39.517190 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [S], seq 3412042648, win 42340, options [mss 1460,sackOK,TS val 103603839 ecr 0,nop,wscale 7], length 0
11:23:39.517255 IP 192.168.247.129.80 > 192.168.247.130.45698: Flags [S.], seq 1327917454, ack 3412042649, win 28960, options [mss 1460,sackOK,TS val 448195836 ecr 103603839,nop,wscale 7], length 0
11:23:39.522705 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 1, win 331, options [nop,nop,TS val 103603844 ecr 448195836], length 0
11:23:39.522744 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [P.], seq 1:148, ack 1, win 331, options [nop,nop,TS val 103603845 ecr 448195836], length 147: HTTP: GET /sfile HTTP/1.1
11:23:39.522762 IP 192.168.247.129.80 > 192.168.247.130.45698: Flags [.], ack 148, win 235, options [nop,nop,TS val 448195841 ecr 103603845], length 0
11:23:39.523368 IP 192.168.247.129.80 > 192.168.247.130.45698: Flags [.], seq 1:4345, ack 148, win 235, options [nop,nop,TS val 448195842 ecr 103603845], length 4344: HTTP: HTTP/1.1 200 OK
......
11:23:39.557235 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 460465, win 6212, options [nop,nop,TS val 103603879 ecr 448195870], length 0
11:23:39.557264 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 463361, win 6257, options [nop,nop,TS val 103603879 ecr 448195870], length 0
11:23:39.557267 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 492321, win 6710, options [nop,nop,TS val 103603879 ecr 448195870], length 0
11:23:39.557269 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 524584, win 7214, options [nop,nop,TS val 103603879 ecr 448195870], length 0
11:23:39.557816 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [F.], seq 148, ack 524584, win 7214, options [nop,nop,TS val 103603880 ecr 448195870], length 0
11:23:39.557997 IP 192.168.247.129.80 > 192.168.247.130.45698: Flags [F.], seq 524584, ack 149, win 235, options [nop,nop,TS val 448195876 ecr 103603880], length 0
11:23:39.563220 IP 192.168.247.130.45698 > 192.168.247.129.80: Flags [.], ack 524585, win 7214, options [nop,nop,TS val 103603885 ecr 448195876], length 0
```

 连接总时间：约46ms。

更改initcwnd到100:

```
[root@localhost zorro]# ip ro change 192.168.247.0/24 dev ens33 proto kernel scope link src 192.168.247.129 metric 100 initcwnd 100
[root@localhost zorro]# ip ro sh
default via 192.168.247.2 dev ens33 proto dhcp metric 100
192.168.122.0/24 dev virbr0 proto kernel scope link src 192.168.122.1 linkdown
192.168.247.0/24 dev ens33 proto kernel scope link src 192.168.247.129 metric 100 initcwnd 100
[root@localhost zorro]# tcpdump -i ens33 -nn port 80
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
11:30:42.463437 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [S], seq 2090764134, win 64240, options [mss 1460,sackOK,TS val 3972003948 ecr 0,nop,wscale 7], length 0
11:30:42.463586 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [S.], seq 2949271896, ack 2090764135, win 28960, options [mss 1460,sackOK,TS val 448618783 ecr 3972003948,nop,wscale 7], length 0
11:30:42.463798 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 1, win 502, options [nop,nop,TS val 3972003948 ecr 448618783], length 0
11:30:42.464058 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [P.], seq 1:148, ack 1, win 502, options [nop,nop,TS val 3972003948 ecr 448618783], length 147: HTTP: GET /sfile HTTP/1.1
11:30:42.464118 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [.], ack 148, win 235, options [nop,nop,TS val 448618783 ecr 3972003948], length 0
11:30:42.464549 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [.], seq 1:31857, ack 148, win 235, options [nop,nop,TS val 448618784 ecr 3972003948], length 31856: HTTP: HTTP/1.1 200 OK
11:30:42.464575 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [P.], seq 31857:63713, ack 148, win 235, options [nop,nop,TS val 448618784 ecr 3972003948], length 31856: HTTP
11:30:42.465277 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 63713, win 179, options [nop,nop,TS val 3972003949 ecr 448618784], length 0
......
11:30:42.471826 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [.], seq 477841:502457, ack 148, win 235, options [nop,nop,TS val 448618791 ecr 3972003956], length 24616: HTTP
11:30:42.471933 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 477841, win 5832, options [nop,nop,TS val 3972003956 ecr 448618791], length 0
11:30:42.472004 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 502457, win 6217, options [nop,nop,TS val 3972003956 ecr 448618791], length 0
11:30:42.472017 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [P.], seq 502457:509697, ack 148, win 235, options [nop,nop,TS val 448618791 ecr 3972003956], length 7240: HTTP
11:30:42.472125 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [P.], seq 509697:524584, ack 148, win 235, options [nop,nop,TS val 448618791 ecr 3972003956], length 14887: HTTP
11:30:42.472317 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 509697, win 6330, options [nop,nop,TS val 3972003956 ecr 448618791], length 0
11:30:42.472345 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 524584, win 6562, options [nop,nop,TS val 3972003957 ecr 448618791], length 0
11:30:42.473027 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [F.], seq 148, ack 524584, win 6562, options [nop,nop,TS val 3972003957 ecr 448618791], length 0
11:30:42.473175 IP 192.168.247.129.80 > 192.168.247.130.55828: Flags [F.], seq 524584, ack 149, win 235, options [nop,nop,TS val 448618792 ecr 3972003957], length 0
11:30:42.473345 IP 192.168.247.130.55828 > 192.168.247.129.80: Flags [.], ack 524585, win 6562, options [nop,nop,TS val 3972003958 ecr 448618792], length 0
^C
52 packets captured
52 packets received by filter
0 packets dropped by kernel
```

整个连接过程在10ms左右，提升很明显。

## slowstart对长连接的影响

对于一个新建TCP连接来说，窗口从初始化cwnd开始，进行slowstart是一个标准过程。而对于一个长连接来说，就不一定了。Linux默认对于一个空闲的tcp连接会重置其窗口长度。就是说，如果你的tcp连接曾经传过数据，窗口已经自适应到比较大了，这时如果连接空闲下来，不传数据，那么后续再传数据就会重新进行slowstart的过程。

好在Linux提供了一个开关可以控制这个行为：/proc/sys/net/ipv4/tcp_slow_start_after_idle。这个文件默认值为1，表示打开这个功能，在上述描述的场景下，可以考虑关闭这个功能，让长连接中的半大不小的数据传输可以减少很多确认等待过程，以加快整体的吞吐量。

我们写一个测试程序，看一下在tcp长连接过程中，多次传输520k左右的数据，在关闭和开启tcp_slow_start_after_idle选项时的数据传输过程，打开时连续传输2次520k数据，传输过程中间休眠10秒钟：

```
[root@localhost zorro]# tcpdump -i ens33 -nn port 8888
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
11:18:49.320195 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [S], seq 304673056, win 64240, options [mss 1460,sackOK,TS val 366473035 ecr 0,nop,wscale 7], length 0
11:18:49.323640 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [S.], seq 1206246451, ack 304673057, win 28960, options [mss 1460,sackOK,TS val 1138068523 ecr 366473035,nop,wscale 7], length 0
11:18:49.323894 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 1, win 502, options [nop,nop,TS val 366473039 ecr 1138068523], length 0
11:18:49.327190 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 1:7241, ack 1, win 227, options [nop,nop,TS val 1138068527 ecr 366473039], length 7240
11:18:49.327205 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [P.], seq 7241:8193, ack 1, win 227, options [nop,nop,TS val 1138068527 ecr 366473039], length 952
11:18:49.327206 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 8193:13985, ack 1, win 227, options [nop,nop,TS val 1138068527 ecr 366473039], length 5792
11:18:49.327396 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 8193, win 466, options [nop,nop,TS val 366473043 ecr 1138068527], length 0
11:18:49.327448 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 13985, win 436, options [nop,nop,TS val 366473043 ecr 1138068527], length 0
11:18:49.330442 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 13985:25569, ack 1, win 227, options [nop,nop,TS val 1138068531 ecr 366473043], length 11584
......
11:18:49.344947 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 412857:467881, ack 1, win 227, options [nop,nop,TS val 1138068545 ecr 366473057], length 55024
11:18:49.344957 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 467881:522905, ack 1, win 227, options [nop,nop,TS val 1138068545 ecr 366473057], length 55024
11:18:49.345398 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [P.], seq 522905:524289, ack 1, win 227, options [nop,nop,TS val 1138068545 ecr 366473057], length 1384
11:18:49.345523 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 412857, win 4303, options [nop,nop,TS val 366473060 ecr 1138068545], length 0
11:18:49.345552 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 467881, win 4244, options [nop,nop,TS val 366473061 ecr 1138068545], length 0
11:18:49.345950 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 524289, win 4289, options [nop,nop,TS val 366473061 ecr 1138068545], length 0

#第二个包传输

11:18:59.338370 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 524289:531529, ack 1, win 227, options [nop,nop,TS val 1138078538 ecr 366473061], length 7240
11:18:59.338389 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [P.], seq 531529:532481, ack 1, win 227, options [nop,nop,TS val 1138078538 ecr 366473061], length 952
11:18:59.338390 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 532481:538273, ack 1, win 227, options [nop,nop,TS val 1138078538 ecr 366473061], length 5792
11:18:59.338668 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 532481, win 4431, options [nop,nop,TS val 366483054 ecr 1138078538], length 0
11:18:59.338691 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 538273, win 4522, options [nop,nop,TS val 366483054 ecr 1138078538], length 0
11:18:59.341994 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 538273:549857, ack 1, win 227, options [nop,nop,TS val 1138078542 ecr 366483054], length 11584
......
11:18:59.354155 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 972673, win 4131, options [nop,nop,TS val 366483069 ecr 1138078553], length 0
11:18:59.357022 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], seq 972673:994393, ack 1, win 227, options [nop,nop,TS val 1138078557 ecr 366483069], length 21720
11:18:59.357259 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [P.], seq 994393:1048577, ack 1, win 227, options [nop,nop,TS val 1138078557 ecr 366483069], length 54184
11:18:59.357575 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 994393, win 4639, options [nop,nop,TS val 366483073 ecr 1138078557], length 0
11:18:59.357686 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [.], ack 1048577, win 4351, options [nop,nop,TS val 366483073 ecr 1138078557], length 0
11:19:09.340034 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [F.], seq 1048577, ack 1, win 227, options [nop,nop,TS val 1138088540 ecr 366483073], length 0
11:19:09.340439 IP 192.168.247.130.58302 > 192.168.247.129.8888: Flags [F.], seq 1, ack 1048578, win 5138, options [nop,nop,TS val 366493056 ecr 1138088540], length 0
11:19:09.343596 IP 192.168.247.129.8888 > 192.168.247.130.58302: Flags [.], ack 2, win 227, options [nop,nop,TS val 1138088544 ecr 366493056], length 0
^C
86 packets captured
86 packets received by filter
0 packets dropped by kernel
```

从抓包结果中可以看到两次数据传输基本都耗时19ms。我们只测量了数据传输时间，并没包含三次握手和四次挥手时间。关闭tcp_slow_start_after_idle之后：

```
[root@localhost zorro]# tcpdump -i ens33 -nn port 8888
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), capture size 262144 bytes
11:21:45.942172 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [S], seq 4207345593, win 64240, options [mss 1460,sackOK,TS val 366649653 ecr 0,nop,wscale 7], length 0
11:21:45.945721 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [S.], seq 2682032804, ack 4207345594, win 28960, options [mss 1460,sackOK,TS val 1138245146 ecr 366649653,nop,wscale 7], length 0
11:21:45.945988 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 1, win 502, options [nop,nop,TS val 366649656 ecr 1138245146], length 0
11:21:45.949242 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 1:7241, ack 1, win 227, options [nop,nop,TS val 1138245150 ecr 366649656], length 7240
11:21:45.949259 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [P.], seq 7241:8193, ack 1, win 227, options [nop,nop,TS val 1138245150 ecr 366649656], length 952
11:21:45.949261 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 8193:13985, ack 1, win 227, options [nop,nop,TS val 1138245150 ecr 366649656], length 5792
11:21:45.949578 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 8193, win 466, options [nop,nop,TS val 366649660 ecr 1138245150], length 0
11:21:45.949749 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 13985, win 436, options [nop,nop,TS val 366649660 ecr 1138245150], length 0
11:21:45.952821 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 13985:25569, ack 1, win 227, options [nop,nop,TS val 1138245153 ecr 366649660], length 11584
......
11:21:45.967182 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 435353:496169, ack 1, win 227, options [nop,nop,TS val 1138245168 ecr 366649674], length 60816
11:21:45.967187 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [P.], seq 496169:524289, ack 1, win 227, options [nop,nop,TS val 1138245168 ecr 366649674], length 28120
11:21:45.967888 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 404945, win 4562, options [nop,nop,TS val 366649678 ecr 1138245168], length 0
11:21:45.967907 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 470105, win 4539, options [nop,nop,TS val 366649678 ecr 1138245168], length 0
11:21:45.967918 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 503409, win 4591, options [nop,nop,TS val 366649678 ecr 1138245168], length 0
11:21:45.968162 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 524289, win 4478, options [nop,nop,TS val 366649679 ecr 1138245168], length 0
#第二个数据传输

11:21:55.961957 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [P.], seq 524289:532481, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 8192
11:21:55.961976 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 532481:539721, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 7240
11:21:55.961977 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 539721:548409, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 8688
11:21:55.961978 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 548409:555649, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 7240
11:21:55.961980 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 555649:564337, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 8688
11:21:55.961981 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 564337:573025, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 8688
11:21:55.961982 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 573025:580265, ack 1, win 227, options [nop,nop,TS val 1138255162 ecr 366649679], length 7240
......
11:21:55.964726 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 998737:1007425, ack 1, win 227, options [nop,nop,TS val 1138255163 ecr 366649679], length 8688
11:21:55.964727 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 1007425:1010321, ack 1, win 227, options [nop,nop,TS val 1138255163 ecr 366649679], length 2896
11:21:55.964999 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 875657, win 3562, options [nop,nop,TS val 366659674 ecr 1138255162], length 0
11:21:55.965013 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 908961, win 3388, options [nop,nop,TS val 366659675 ecr 1138255162], length 0
11:21:55.965022 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 942265, win 3213, options [nop,nop,TS val 366659675 ecr 1138255162], length 0
11:21:55.965030 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 952401, win 3160, options [nop,nop,TS val 366659675 ecr 1138255162], length 0
11:21:55.965104 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 958193, win 3130, options [nop,nop,TS val 366659675 ecr 1138255162], length 0
11:21:55.966118 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], seq 1010321:1027697, ack 1, win 227, options [nop,nop,TS val 1138255167 ecr 366659673], length 17376
11:21:55.966269 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [P.], seq 1027697:1048577, ack 1, win 227, options [nop,nop,TS val 1138255167 ecr 366659673], length 20880
11:21:55.966852 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 1011769, win 3166, options [nop,nop,TS val 366659677 ecr 1138255167], length 0
11:21:55.966970 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [.], ack 1048577, win 2969, options [nop,nop,TS val 366659678 ecr 1138255167], length 0



11:22:05.963427 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [F.], seq 1048577, ack 1, win 227, options [nop,nop,TS val 1138265164 ecr 366659678], length 0
11:22:05.963761 IP 192.168.247.130.58306 > 192.168.247.129.8888: Flags [F.], seq 1, ack 1048578, win 4721, options [nop,nop,TS val 366669675 ecr 1138265164], length 0
11:22:05.966819 IP 192.168.247.129.8888 > 192.168.247.130.58306: Flags [.], ack 2, win 227, options [nop,nop,TS val 1138265167 ecr 366669675], length 0
^C
119 packets captured
131 packets received by filter
12 packets dropped by kernel
```

可以看到两次耗时分别为：23ms和5ms。从抓包中也可以看出关闭tcp_slow_start_after_idle之后，第二次的数据传输窗口沿用了之前已经动态调大的窗口，使得第二个数据发送延时大大缩短。

## 最后

通过本文我们讨论了一下TCP的慢启动在数据传输开始过程中，以及TCP长连接的过程中，延时对传输的影响。我们发现在某些应用场景下，少量的延时增加，会导致数据传输整体延时大大增加。我们也描述了在相关场景下如何调大慢启动过程的初始化cwnd窗口和如何关闭长连接中的空闲之后的慢启动过程，以减小延时的影响增大传输吞吐量。

希望本文能对大家有帮助。最后附上最后一个测试中tcp长连接服务端测试代码，客户端直接使用telnet连接即可：

```
#include <sys/types.h>
#include <sys/socket.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <netinet/in.h>
#include <netinet/ip.h>
#include <arpa/inet.h>

#define PATHNAME "/var/www/html/sfile"

int main(void)
{
	int sfd, afd, clilen, fd, ret;
	struct sockaddr_in addr, cliaddr;
	char buf[BUFSIZ];
	char addrstr[INET_ADDRSTRLEN];

	fd = open(PATHNAME, O_RDONLY);
	if (fd < 0) {
		perror("open()");
		exit(1);
	}

	sfd = socket(AF_INET, SOCK_STREAM, 0);
	if (sfd < 0) {
		perror("socket()");
		exit(1);
	}

	static int val = 1;
	if (setsockopt(sfd, SOL_SOCKET, SO_REUSEADDR, &val, sizeof(val)) < 0) {
		perror("setsockopt()");
		exit(1);
	}

	bzero(&addr, sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_port = htons(8888);
//	addr.sin_addr.s_addr = INADDR_ANY;
	if (inet_pton(AF_INET, "0.0.0.0", &addr.sin_addr) <= 0) {
		perror("inet_pton()");
		exit(1);
	}


	if (bind(sfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		perror("bind()");
		exit(1);
	}

	if (listen(sfd, 10) < 0) {
		perror("listen()");
		exit(1);
	}

	clilen = sizeof(cliaddr);
	while (1) {
		afd = accept(sfd, (struct sockaddr *)&cliaddr, &clilen);
		if (afd < 0) {
			perror("accept()");
			exit(1);
		}

		bzero(buf, BUFSIZ);

		while ((ret = read(fd, buf, BUFSIZ)) > 0) {
			if (write(afd, buf, ret) < 0) {
				perror("write()");
				exit(1);
			}
		}

		if (ret < 0) {
			perror("read()");
			exit(1);
		}

		sleep(10);

		ret = lseek(fd, SEEK_SET, 0);
		if (ret < 0) {
			perror("lseek()");
			exit(1);
		}


		while ((ret = read(fd, buf, BUFSIZ)) > 0) {
			if (write(afd, buf, ret) < 0) {
				perror("write()");
				exit(1);
			}
		}

		if (ret < 0) {
			perror("read()");
			exit(1);
		}

		sleep(10);
		close(afd);
	}
	close(sfd);
	exit(0);
}
```



----------------------------------

大家好，我是Zorro！

如果你喜欢本文，欢迎在微博上搜索“**orroz**”关注我，地址是：
[https://weibo.com/orroz](https://weibo.com/orroz)

大家也可以在微信上搜索：**Linux系统技术** 关注我的公众号。

我的所有文章都会沉淀在我的个人博客上，地址是：
[https://zorrozou.github.io/](https://zorrozou.github.io/)。

欢迎使用以上各种方式一起探讨学习，共同进步。

公众号二维码：

![Zorro］ icon](http://ww1.sinaimg.cn/mw690/6673053fgw1f31zfw1dprj20by0by0tc.jpg)

----------------------------------

